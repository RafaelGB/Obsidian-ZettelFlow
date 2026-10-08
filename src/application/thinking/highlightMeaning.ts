/**
 * What a highlight means (#720, epic #723): four, closed, chosen by you when you mark the passage.
 *
 * Not a colour picker — a meaning, with a colour from the theme. It travels with the thought into
 * Think, where you can filter by it. Nothing ever infers one (§XII): a highlight made before
 * meanings existed reads as an idea, and nothing is rewritten for it.
 */
import type { Thought } from "./thought";

export const HIGHLIGHT_MEANINGS = ["idea", "question", "quote", "discuss"] as const;
export type HighlightMeaning = (typeof HIGHLIGHT_MEANINGS)[number];

export const DEFAULT_MEANING: HighlightMeaning = "idea";

export function isMeaning(value: unknown): value is HighlightMeaning {
    return typeof value === "string" && (HIGHLIGHT_MEANINGS as readonly string[]).includes(value);
}

/** A highlight's meaning; one made before meanings existed is an idea. */
export function meaningOf(thought: Pick<Thought, "meaning">): HighlightMeaning {
    return thought.meaning ?? DEFAULT_MEANING;
}
