/**
 * Provider-agnostic AI interface (#156, FR-2). One method: turn a prompt into a completion string.
 * Implementations are bring-your-own; ZettelFlow ships a single OpenAI-compatible client. Kept tiny
 * on purpose so the plugin never couples to a specific vendor.
 */
export interface AiProvider {
    complete(prompt: string): Promise<string>;
    /**
     * A prompt about one image (#748): the handwriting of one ink note, sent only when the user
     * presses *Read as text*. Optional — a provider without it is a model that does not read images,
     * and the caller says so (`no-image`) rather than throwing.
     */
    see?(prompt: string, image: AiImage): Promise<string>;
}

/** An image sent with a prompt (#748): a PNG, base64-encoded, never a URL. */
export interface AiImage {
    mime: "image/png";
    base64: string;
}
