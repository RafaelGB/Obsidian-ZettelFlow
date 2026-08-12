/**
 * Provider-agnostic AI interface (#156, FR-2). One method: turn a prompt into a completion string.
 * Implementations are bring-your-own; ZettelFlow ships a single OpenAI-compatible client. Kept tiny
 * on purpose so the plugin never couples to a specific vendor.
 */
export interface AiProvider {
    complete(prompt: string): Promise<string>;
}
