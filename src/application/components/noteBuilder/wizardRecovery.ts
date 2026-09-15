/**
 * What you can do when a step breaks (#417, epic #405) — pure.
 *
 * An uncaught render error unmounts the React tree, so a throwing step component left an **empty
 * modal**: no message, no idea which step failed, and no way to keep the answers already given. A
 * blank modal is the one state from which no choice is possible.
 *
 * The recoveries offered have to be the ones that actually exist in that situation — an option that
 * cannot work is worse than no option, so the set is derived rather than hardcoded.
 */

export type RecoveryAction = "retry" | "back" | "skip" | "build";

export interface RecoverySituation {
    /** There is a walked step to return to. */
    canGoBack: boolean;
    /** The failing step is optional, so the flow can continue past it. */
    canSkip: boolean;
    /** Something has already been answered, so a note can be built from it. */
    hasContent: boolean;
    /** A retry already failed; offering the same button again is a loop, not a recovery. */
    retried?: boolean;
}

/** The recoveries worth offering, in the order they should be tried. */
export function recoveryActions(situation: RecoverySituation): RecoveryAction[] {
    const actions: RecoveryAction[] = [];
    if (!situation.retried) actions.push("retry");
    if (situation.canGoBack) actions.push("back");
    if (situation.canSkip) actions.push("skip");
    if (situation.hasContent) actions.push("build");
    return actions;
}

/** Upper bound on the message shown and logged; a stack in a modal helps nobody. */
export const MAX_FAILURE_MESSAGE = 300;

/**
 * A readable one-line description of whatever was thrown. React hands boundaries `unknown`, and a
 * component can throw a string, an object, or nothing at all.
 */
export function describeFailure(error: unknown): string {
    if (error instanceof Error && error.message) return trim(error.message);
    if (typeof error === "string" && error.trim()) return trim(error);
    if (error && typeof error === "object") {
        const message = (error as { message?: unknown }).message;
        if (typeof message === "string" && message.trim()) return trim(message);
    }
    return "Unknown error";
}

function trim(message: string): string {
    const single = message.replace(/\s+/g, " ").trim();
    return single.length > MAX_FAILURE_MESSAGE
        ? `${single.slice(0, MAX_FAILURE_MESSAGE - 1)}…`
        : single;
}
