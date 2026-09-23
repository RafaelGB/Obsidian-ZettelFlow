import type { Judgement } from "architecture/knowledge/judgement";
import type { Move } from "application/thinking/move";
import type { Snapshot } from "./recordSnapshot";

/**
 * What a point on the timeline is: a conceptual snapshot (#168), a recorded verdict (#336), a
 * **move** (#494), or a **thought written about the note** (#540) — what changed, what you ruled,
 * what you did, and what you thought.
 */
export type TimelineEventKind = "snapshot" | "judgement" | "move" | "thought";

/**
 * A thought, as the timeline needs it (#540): where it is and when it was written, and nothing
 * else. Deliberately **not** its text — the timeline is opt-in because it stores claim texts, and
 * a strand that smuggled more past that opt-in would break the bargain it was granted under.
 */
export interface ThoughtRef {
    /** The thought's own id, as its frontmatter records it. */
    id: string;
    /** When it was written. */
    at: number;
    /** Where it lives, so a row can open it. */
    path: string;
}

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
    /** Present when `kind === "thought"`. */
    thought?: ThoughtRef;
}

const RANK: Record<TimelineEventKind, number> = { snapshot: 0, judgement: 1, move: 2, thought: 3 };

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
    moves: readonly Move[] = [],
    /**
     * The thoughts written **about** this note (#540), default-empty for the same reason.
     *
     * Nothing records these: a thought already carries the note it is about, so the timeline reads
     * a link that has been in the data all along. Which is also why the strand is **retroactive** —
     * a thought written before this shipped appears the first time the note is opened.
     */
    thoughts: readonly ThoughtRef[] = []
): TimelineEvent[] {
    const events: TimelineEvent[] = [];
    for (const snapshot of snapshots) events.push({ at: snapshot.at, kind: "snapshot", snapshot });
    for (const judgement of judgements) events.push({ at: judgement.at, kind: "judgement", judgement });
    for (const move of moves) events.push({ at: move.at, kind: "move", move });
    for (const thought of thoughts) events.push({ at: thought.at, kind: "thought", thought });
    events.sort((a, b) => a.at - b.at || kindRank(a.kind) - kindRank(b.kind));
    return events;
}
