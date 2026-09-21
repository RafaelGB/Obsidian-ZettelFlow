import type { Judgement } from "architecture/knowledge/judgement";
import type { Move } from "application/thinking/move";
import type { Snapshot } from "./recordSnapshot";

/**
 * What a point on the timeline is: a conceptual snapshot (#168), a recorded verdict (#336), or a
 * **move** (#494) — what changed, what you ruled, and what you *did*.
 */
export type TimelineEventKind = "snapshot" | "judgement" | "move";

/** One point on the living timeline, tagged so the view can mark it. */
export interface TimelineEvent {
    at: number;
    kind: TimelineEventKind;
    /** Present when `kind === "snapshot"`. */
    snapshot?: Snapshot;
    /** Present when `kind === "judgement"`. */
    judgement?: Judgement;
    /** Present when `kind === "move"`. */
    move?: Move;
}

const RANK: Record<TimelineEventKind, number> = { snapshot: 0, judgement: 1, move: 2 };

function kindRank(kind: TimelineEventKind): number {
    return RANK[kind];
}

/**
 * Merge a note's conceptual snapshots (#168), its judgement history (#336) and its **moves**
 * (#494) into one time-ordered event stream (#362, D2) — so the Evolution timeline can show the *thinking* that changed an idea, not
 * only what changed. Pure and deterministic: it reads only what it is given (the caller scopes both
 * inputs to a single note and to the knowledge scope), never a live vault. Ordering is by `at`
 * ascending, with a **snapshot before a judgement** on a tie so the same instant renders identically
 * every time. Obsidian-free.
 */
export function timelineEvents(
    snapshots: readonly Snapshot[],
    judgements: readonly Judgement[],
    /** Default-empty, so every existing caller and every existing test is untouched (#494). */
    moves: readonly Move[] = []
): TimelineEvent[] {
    const events: TimelineEvent[] = [];
    for (const snapshot of snapshots) events.push({ at: snapshot.at, kind: "snapshot", snapshot });
    for (const judgement of judgements) events.push({ at: judgement.at, kind: "judgement", judgement });
    for (const move of moves) events.push({ at: move.at, kind: "move", move });
    events.sort((a, b) => a.at - b.at || kindRank(a.kind) - kindRank(b.kind));
    return events;
}
