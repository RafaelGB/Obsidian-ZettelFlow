/** Raised when an AI provider response cannot be parsed into a completion string. */
export class AiResponseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AiResponseError";
    }
}

/** The OpenAI-compatible chat-completions request body. */
export interface ChatRequestBody {
    model: string;
    messages: { role: string; content: string }[];
    max_tokens?: number;
}

/** Options bounding/hardening a chat request (#301). */
export interface ChatRequestOptions {
    /** Sent as `max_tokens` to bound completion cost (#301 S1). */
    maxTokens?: number;
    /** A `system` message that asserts task authority over untrusted note content (#301 S3). */
    system?: string;
}

/**
 * Pure builder for a chat request (#156, FR-2). When a `system` guard is provided it is sent as a
 * separate `system` role so instructions embedded in the (untrusted) note content can't override the
 * task (#301 S3); a `maxTokens` bound is sent as `max_tokens` (#301 S1). Obsidian-free.
 */
export function buildChatRequestBody(
    model: string,
    prompt: string,
    options: ChatRequestOptions = {}
): ChatRequestBody {
    const messages: { role: string; content: string }[] = [];
    if (options.system && options.system.length > 0) {
        messages.push({ role: "system", content: options.system });
    }
    messages.push({ role: "user", content: prompt });
    const body: ChatRequestBody = { model, messages };
    if (typeof options.maxTokens === "number" && options.maxTokens > 0) {
        body.max_tokens = options.maxTokens;
    }
    return body;
}

/**
 * Pure parser for an OpenAI-compatible chat-completions response (#156, FR-2/AC-2). Returns the
 * first choice's message content, or throws {@link AiResponseError} on any malformed shape (not an
 * object, missing/empty `choices`, missing `message`, missing/empty `content`). Obsidian-free.
 */
export function parseChatCompletion(json: unknown): string {
    const choices = asRecord(json)?.choices;
    if (!Array.isArray(choices) || choices.length === 0) {
        throw new AiResponseError("AI response had no choices");
    }
    const message = asRecord(choices[0] as unknown)?.message;
    const content = asRecord(message)?.content;
    if (typeof content !== "string" || content.length === 0) {
        throw new AiResponseError("AI response had no message content");
    }
    return content;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}
