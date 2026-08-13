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
