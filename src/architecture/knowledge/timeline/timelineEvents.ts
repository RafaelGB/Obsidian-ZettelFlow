import type { Judgement } from "architecture/knowledge/judgement";
import type { Snapshot } from "./recordSnapshot";

/** Whether a timeline event is a conceptual snapshot (#168) or a recorded verdict (#336). */
export type TimelineEventKind = "snapshot" | "judgement";

/** One point on the living timeline: a snapshot **or** a judgement, tagged so the view can mark it. */
export interface TimelineEvent {
    at: number;
    kind: TimelineEventKind;
    /** Present when `kind === "snapshot"`. */
    snapshot?: Snapshot;
    /** Present when `kind === "judgement"`. */
    judgement?: Judgement;
}

function kindRank(kind: TimelineEventKind): number {
    return kind === "snapshot" ? 0 : 1;
}

/**
 * Merge a note's conceptual snapshots (#168) with its judgement history (#336) into one time-ordered
 * event stream (#362, D2) — so the Evolution timeline can show the *thinking* that changed an idea, not
 * only what changed. Pure and deterministic: it reads only what it is given (the caller scopes both
 * inputs to a single note and to the knowledge scope), never a live vault. Ordering is by `at`
 * ascending, with a **snapshot before a judgement** on a tie so the same instant renders identically
 * every time. Obsidian-free.
 */
export function timelineEvents(
    snapshots: readonly Snapshot[],
    judgements: readonly Judgement[]
): TimelineEvent[] {
    const events: TimelineEvent[] = [];
    for (const snapshot of snapshots) events.push({ at: snapshot.at, kind: "snapshot", snapshot });
    for (const judgement of judgements) events.push({ at: judgement.at, kind: "judgement", judgement });
    events.sort((a, b) => a.at - b.at || kindRank(a.kind) - kindRank(b.kind));
    return events;
}
