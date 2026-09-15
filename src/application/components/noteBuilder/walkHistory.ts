import type { FinalElement } from "application/notes";

/**
 * Moving around the walk you already made (#413, epic #405) — pure.
 *
 * The wizard had one back button that popped a single position. Correcting a choice made four steps
 * ago cost four blind clicks, so people abandoned the flow and started over instead. These are the
 * rules that make jumping (and undo/redo) safe: what gets discarded, what is captured so it can come
 * back, and which steps cannot honestly be undone.
 */

/** The note contributions of the steps after a given position — captured so a redo can restore them. */
export interface WalkContribution {
    paths: [number, string][];
    elements: [number, FinalElement][];
}

/** How many walked steps a jump to `targetIndex` (0-based, in walk order) would discard. */
export function discardedCount(walked: number[], targetIndex: number): number {
    if (targetIndex < 0 || targetIndex >= walked.length) return 0;
    return walked.length - targetIndex;
}

/**
 * Everything at or after `fromPosition`. `NoteDTO.deletePos` drops exactly this, so capturing it
 * first is what makes the drop reversible.
 */
export function captureContributions(
    paths: Map<number, string>,
    elements: Map<number, FinalElement>,
    fromPosition: number
): WalkContribution {
    return {
        paths: [...paths.entries()]
            .filter(([position]) => position >= fromPosition)
            .sort((a, b) => a[0] - b[0]),
        elements: [...elements.entries()]
            .filter(([position]) => position >= fromPosition)
            .sort((a, b) => a[0] - b[0]),
    };
}

/**
 * Action types whose effect reaches **outside the note being built**, so returning past them cannot
 * undo what already happened. The user is still allowed to go back — they are told, not blocked.
 *
 * A script can do anything; an AI action already spent a request and recorded a verdict.
 */
export const NON_REPLAYABLE_ACTIONS = new Set(["script", "ai"]);

export function isReplayable(actionType: string | undefined, category?: string): boolean {
    if (!actionType) return true;
    if (NON_REPLAYABLE_ACTIONS.has(actionType)) return false;
    return category !== "ai";
}

/** The steps being discarded whose effects already happened. */
export function alreadyApplied(
    steps: { title: string; actionType?: string; category?: string }[]
): string[] {
    return steps
        .filter((step) => !isReplayable(step.actionType, step.category))
        .map((step) => step.title);
}

/**
 * The redo stack: one entry per undone step. A new answer clears it — history is a line, not a tree,
 * because a branching history nobody asked for is a puzzle, not a feature.
 */
export interface RedoEntry<Section> {
    position: number;
    section: Section;
    contribution: WalkContribution;
}

export function pushRedo<S>(stack: RedoEntry<S>[], entry: RedoEntry<S>): RedoEntry<S>[] {
    return [...stack, entry];
}

export function popRedo<S>(
    stack: RedoEntry<S>[]
): { entry: RedoEntry<S> | undefined; rest: RedoEntry<S>[] } {
    if (stack.length === 0) return { entry: undefined, rest: stack };
    return { entry: stack[stack.length - 1], rest: stack.slice(0, -1) };
}
