/** The opt-in AI provider configuration (#156). Off by default; blank fields ⇒ not usable. */
export interface AiSettings {
    /** Master switch — while false, no AI action ever reaches the network. */
    enabled: boolean;
    /** Full OpenAI-compatible chat-completions endpoint URL (bring-your-own; no default). */
    endpoint: string;
    /** API key (bring-your-own; stored in the plugin data.json; never logged). */
    apiKey: string;
    /** Model name passed to the provider. */
    model: string;
    /**
     * Max characters of prompt content sent per request (#301 S1). Bounds cost/latency so a huge
     * note (or many linked notes) can't send an unbounded payload. Falls back to the default.
     */
    maxInputChars?: number;
    /** Max completion tokens requested (#301 S1) — sent as `max_tokens`. Falls back to the default. */
    maxOutputTokens?: number;
}

/** Default cap on prompt content sent per request when the user hasn't set one (#301 S1). */
export const DEFAULT_AI_MAX_INPUT_CHARS = 12_000;
/** Default cap on requested completion tokens when the user hasn't set one (#301 S1). */
export const DEFAULT_AI_MAX_OUTPUT_TOKENS = 800;

/** The effective input-char cap for the given settings (never below 500). */
export function aiMaxInputChars(ai: AiSettings): number {
    const value = ai.maxInputChars ?? DEFAULT_AI_MAX_INPUT_CHARS;
    return Number.isFinite(value) && value >= 500 ? value : DEFAULT_AI_MAX_INPUT_CHARS;
}

/** The effective completion-token cap for the given settings (never below 16). */
export function aiMaxOutputTokens(ai: AiSettings): number {
    const value = ai.maxOutputTokens ?? DEFAULT_AI_MAX_OUTPUT_TOKENS;
    return Number.isFinite(value) && value >= 16 ? value : DEFAULT_AI_MAX_OUTPUT_TOKENS;
}

/** Truncate `text` to `maxChars`, appending a visible marker when cut. Pure. */
export function capText(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    return `${text.slice(0, maxChars)}\n\n[…truncated by ZettelFlow to fit the AI input limit]`;
}

/** The three observable states of the AI gate. */
export type AiGateState = "disabled" | "unconfigured" | "ready";

/**
 * Pure gate decision (#156, FR-1/AC-1). `disabled` when the master switch is off — regardless of
 * config, so a disabled switch can never reach the provider; `unconfigured` when any of
 * endpoint/apiKey/model is blank; `ready` only when enabled and fully configured. Obsidian-free.
 */
export function aiGateDecision(ai: AiSettings): AiGateState {
    if (!ai.enabled) return "disabled";
    if (!ai.endpoint.trim() || !ai.apiKey.trim() || !ai.model.trim()) return "unconfigured";
    return "ready";
}
