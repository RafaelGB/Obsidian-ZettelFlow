import type { CompanionSectionId } from "architecture/knowledge/state";
import type { CompanionFocus } from "./noteCompanionContract";

export interface FocusPlan {
    /** The section to open, if it has anything in it. */
    expand: CompanionSectionId | null;
    /** Scroll to that section, or to the folded line that says it is empty. */
    scrollTo: "section" | "folded";
}

/**
 * Where a hand-over lands among the sections (#640 FR-21/22). An empty section still gets you
 * somewhere: the folded line that says it is empty, so the hand-over never looks like it failed.
 * `next` belongs to the next-step card (#641), so the sections decline it.
 */
export function focusPlan(focus: CompanionFocus, nonEmpty: readonly CompanionSectionId[]): FocusPlan | null {
    if (focus === "next") return null;
    return nonEmpty.includes(focus) ? { expand: focus, scrollTo: "section" } : { expand: null, scrollTo: "folded" };
}
