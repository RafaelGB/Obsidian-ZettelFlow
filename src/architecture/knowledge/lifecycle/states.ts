/**
 * The canonical note lifecycle (#146). The **stored** value in frontmatter is always the plain
 * ASCII token (decision #3); the emoji is display-only and never written. Pure & Obsidian-free.
 */

export type LifecycleState =
    | "fleeting"
    | "literature"
    | "permanent"
    | "developing"
    | "evergreen"
    | "archived";

/** The six states, in lifecycle order. */
export const LIFECYCLE_STATES: readonly LifecycleState[] = [
    "fleeting",
    "literature",
    "permanent",
    "developing",
    "evergreen",
    "archived",
] as const;

/** Display-only emoji for each state (never stored in the note). */
export const STATE_EMOJI: Readonly<Record<LifecycleState, string>> = {
    fleeting: "🌱",
    literature: "📝",
    permanent: "💡",
    developing: "🔬",
    evergreen: "📚",
    archived: "🪦",
};

/** A note with no/empty/unrecognized state reads as fleeting (decision #1). */
export const FALLBACK_STATE: LifecycleState = "fleeting";

export const DEFAULT_STATE_PROPERTY = "state";
export const DEFAULT_CREATED_PROPERTY = "created";
export const DEFAULT_LAST_REVIEWED_PROPERTY = "last-reviewed";

/**
 * i18n key of each state's sentence-case display label. Pure data (plain strings) so it can live
 * with the vocabulary; the actual `t()` lookup happens in the impure layers that render labels.
 */
export const STATE_LABEL_KEY = {
    fleeting: "lifecycle_state_fleeting",
    literature: "lifecycle_state_literature",
    permanent: "lifecycle_state_permanent",
    developing: "lifecycle_state_developing",
    evergreen: "lifecycle_state_evergreen",
    archived: "lifecycle_state_archived",
} as const;

const EMOJI_PREFIX = new RegExp(`^(?:${Object.values(STATE_EMOJI).join("|")})\\s*`, "u");

/** Strip a leading state emoji, trim and lowercase — the form used for matching a stored value. */
export function normalize(raw: string): string {
    return raw.replace(EMOJI_PREFIX, "").trim().toLowerCase();
}

export function isLifecycleState(value: string): value is LifecycleState {
    return (LIFECYCLE_STATES as readonly string[]).includes(value);
}
