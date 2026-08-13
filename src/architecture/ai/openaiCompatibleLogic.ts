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
}

/** Pure builder for a single-user-message chat request (#156, FR-2). Obsidian-free. */
export function buildChatRequestBody(model: string, prompt: string): ChatRequestBody {
    return { model, messages: [{ role: "user", content: prompt }] };
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
