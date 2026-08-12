import { requestUrl } from "obsidian";
import { AiProvider } from "./AiProvider";
import type { AiSettings } from "./aiGate";
import { buildChatRequestBody, parseChatCompletion } from "./openaiCompatibleLogic";

/**
 * The single built-in {@link AiProvider} (#156, FR-2/FR-3): an OpenAI-compatible chat-completions
 * client. POSTs to the user-configured endpoint via Obsidian `requestUrl` (never `fetch`), sends the
 * key only as a `Bearer` header, and never logs it. A non-2xx status throws a status-only error (no
 * key, no body) so the shared gate can degrade gracefully.
 */
export class OpenAiCompatibleProvider implements AiProvider {
    constructor(private readonly settings: AiSettings) {}

    async complete(prompt: string): Promise<string> {
        const response = await requestUrl({
            url: this.settings.endpoint,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.settings.apiKey}`,
            },
            body: JSON.stringify(buildChatRequestBody(this.settings.model, prompt)),
            throw: false,
        });
        if (response.status < 200 || response.status >= 300) {
            throw new Error(`AI request failed with status ${response.status}`);
        }
        return parseChatCompletion(response.json as unknown);
    }
}
