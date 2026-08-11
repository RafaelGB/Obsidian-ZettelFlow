/**
 * The WAIT primitive (#151) — the one genuinely new block kind. A WAIT node pauses a running
 * workflow until the user confirms (human-in-the-loop). v1 supports **confirmation only** (maintainer
 * decision OQ-2); `mode` is a discriminant reserved so a future timed/event WAIT can be added without
 * a migration. Pure & Obsidian-free — the marker is stored additively in a step's `zettelFlowSettings`.
 */

/** The WAIT marker carried on a node's step settings. */
export interface WaitSettings {
    /** v1: only human confirmation. Reserved for future `"delay"` / `"event"` modes. */
    mode: "confirm";
    /** Optional text shown on the confirmation prompt. */
    message?: string;
}

export function isWaitSettings(value: unknown): value is WaitSettings {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as { mode?: unknown; message?: unknown };
    if (candidate.mode !== "confirm") return false;
    return candidate.message === undefined || typeof candidate.message === "string";
}

/** Whether a node carries a valid WAIT marker (and so should suspend the wizard). */
export function isWaitNode(node: { wait?: unknown }): boolean {
    return isWaitSettings(node.wait);
}
