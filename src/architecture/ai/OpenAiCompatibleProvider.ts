import { requestUrl } from "obsidian";
import type { AiImage, AiProvider } from "./AiProvider";
import { aiMaxOutputTokens, type AiSettings } from "./aiGate";
import { AiVisionError, buildChatRequestBody, buildVisionRequestBody, classifyVisionFailure, parseChatCompletion, type ChatRequestBody } from "./openaiCompatibleLogic";
import { AI_SYSTEM_GUARD, isEndpointAllowed } from "./promptSafety";

/** Bound each request so a hung/misconfigured endpoint fails with a clear error instead of pending. */
const REQUEST_TIMEOUT_MS = 30_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: number | undefined;
    const timeout = new Promise<T>((_resolve, reject) => {
        timer = window.setTimeout(() => reject(new Error(`AI request timed out after ${ms}ms`)), ms);
    });
    // Clear the timer once the request settles so it never lingers (harmless in prod, a leak in tests).
    return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

/**
 * The single built-in {@link AiProvider} (#156, FR-2/FR-3): an OpenAI-compatible chat-completions
 * client. POSTs to the user-configured endpoint via Obsidian `requestUrl` (never `fetch`), sends the
 * key only as a `Bearer` header, and never logs it. A non-2xx status throws a status-only error (no
 * key, no body) so the shared gate can degrade gracefully.
 */
export class OpenAiCompatibleProvider implements AiProvider {
    constructor(private readonly settings: AiSettings) {}

    async complete(prompt: string): Promise<string> {
        const body = buildChatRequestBody(this.settings.model, prompt, {
            maxTokens: aiMaxOutputTokens(this.settings),
            system: AI_SYSTEM_GUARD,
        });
        const response = await this.post(body);
        if (response.status < 200 || response.status >= 300) {
            throw new Error(`AI request failed with status ${response.status}`);
        }
        return parseChatCompletion(response.json as unknown);
    }

    /**
     * A prompt about one image (#748): the same endpoint, guard, key, time-out and output cap as
     * {@link complete}. A refused image (400/415/422) throws `AiVisionError("no-image")`; any other
     * failure `AiVisionError("failed")` — by status alone, no body read or logged.
     */
    async see(prompt: string, image: AiImage): Promise<string> {
        const body = buildVisionRequestBody(this.settings.model, prompt, image, {
            maxTokens: aiMaxOutputTokens(this.settings),
            system: AI_SYSTEM_GUARD,
        });
        const response = await this.post(body);
        if (response.status < 200 || response.status >= 300) {
            throw new AiVisionError(classifyVisionFailure(response.status), response.status);
        }
        return parseChatCompletion(response.json as unknown);
    }

    private post(body: ChatRequestBody) {
        // Never POST note content to a non-https (or non-loopback-http) endpoint (#301 S5).
        if (!isEndpointAllowed(this.settings.endpoint)) {
            return Promise.reject(new Error("AI endpoint must be an https URL (or http on localhost)"));
        }
        return withTimeout(
            requestUrl({
                url: this.settings.endpoint,
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.settings.apiKey}`,
                },
                body: JSON.stringify(body),
                throw: false,
            }),
            REQUEST_TIMEOUT_MS
        );
    }
}
