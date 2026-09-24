import type { Judgement } from "architecture/knowledge/judgement";
import type { Move } from "application/thinking/move";
import type { Snapshot } from "./recordSnapshot";
import { CLAIM_SUBJECT_PREFIX } from "architecture/knowledge/claims/keys";

/**
 * What a point on the timeline is: a conceptual snapshot (#168), a recorded verdict (#336), a
 * **move** (#494), a **thought written about the note** (#540), or a **return** (#564) — what
 * changed, what you ruled, what you did, what you thought, and what you now say.
 */
export type TimelineEventKind = "snapshot" | "judgement" | "move" | "thought" | "return";

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

/**
 * A claim you were asked about again (#564, epic #558).
 *
 * The timeline already held both halves of this: a snapshot whose claim set changed, and the
 * verdict you gave. It drew them as two unrelated rows on the same day — which is the difference
 * between a log and a mirror. *A snapshot happened* and *you ruled on something* are two facts;
 * **"in June you said X, today you say Y, and here is the moment you decided"** is the sentence
 * this epic exists to produce.
 *
 * It is a join, never a guess. The two are paired only when the verdict is about this note's claim,
 * lands within {@link RETURN_PAIR_WINDOW_MS} of the snapshot, and the claim set moved by exactly one
 * sentence out and one in. Anything else renders as it did before: two rows told as one story would
 * be worse than the two rows.
 */
export interface ReturnEvent {
    /** The verdict you gave: it still says this, it says this now, or you withdrew it. */
    verdict: string;
    /**
     * What it said. Absent when the history was not being kept.
     *
     * `said`/`says` rather than `then`/`now`, for the reason the return's view model has the same
     * pair of names: an object with a `then` is a **thenable**, and one `await` on an event would
     * silently call it.
     */
    said?: string;
    /** What it says now. Only a rewrite has one. */
    says?: string;
    /** The thought a withdrawn sentence became, when one is in the window (#562). */
    thought?: ThoughtRef;
    /** The verdict itself, so a row can read its origin and its time. */
    judgement: Judgement;
}

/**
 * How far apart the snapshot and the verdict may be and still be one act.
 *
 * Five minutes. The write and the verdict are milliseconds apart when the return does them, so the
 * window only has to survive a debounce and a slow disk — and a window wide enough to catch a
 * coincidence is how a pairing becomes a fabrication.
 */
export const RETURN_PAIR_WINDOW_MS = 5 * 60_000;

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
    /** Present when `kind === "return"` (#564). */
    return?: ReturnEvent;
}

// A return sits where its verdict sat, because that is the moment it describes.
const RANK: Record<TimelineEventKind, number> = { snapshot: 0, judgement: 1, return: 1, move: 2, thought: 3 };

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
    return pairReturns(events);
}

/** The claim texts one set has and the other does not, in note order. */
function difference(from: readonly string[], to: readonly string[]): string[] {
    return from.filter((text) => !to.includes(text));
}

/** The newest snapshot at or before `at` that actually said something. */
function saidAt(events: readonly TimelineEvent[], at: number): string | undefined {
    for (let index = events.length - 1; index >= 0; index--) {
        const event = events[index];
        if (event.kind !== "snapshot" || !event.snapshot || event.at > at) continue;
        const claim = event.snapshot.claims[0];
        if (claim) return claim;
    }
    return undefined;
}

/** The snapshot before the one at `index`, whatever else lies between them. */
function previousSnapshot(events: readonly TimelineEvent[], index: number): Snapshot | undefined {
    for (let other = index - 1; other >= 0; other--) {
        const candidate = events[other];
        if (candidate.kind === "snapshot" && candidate.snapshot) return candidate.snapshot;
    }
    return undefined;
}

/**
 * Tell a claim's verdict and the change it caused as **one** event (#564).
 *
 * Pure, and conservative by construction: a verdict it cannot pair renders as the judgement it
 * always was. The three cases differ only in where *then* and *now* come from — a rewrite has both,
 * a confirmation has only *then*, and a withdrawal has *then* plus the thought the sentence became.
 */
function pairReturns(events: TimelineEvent[]): TimelineEvent[] {
    const consumed = new Set<number>();
    const paired = new Map<number, ReturnEvent>();

    events.forEach((event, index) => {
        const judgement = event.judgement;
        if (event.kind !== "judgement" || !judgement) return;
        if (!judgement.subject?.startsWith(CLAIM_SUBJECT_PREFIX)) return;

        const entry: ReturnEvent = { verdict: judgement.verdict, judgement };

        if (judgement.verdict === "modified") {
            // The snapshot this verdict produced: nearest in the window, and only when the claim
            // set moved by exactly one sentence out and one in. Two-for-two is a bulk edit, and
            // pairing it would invent a story.
            let best: { index: number; out: string; arrived: string } | undefined;
            events.forEach((candidate, other) => {
                if (candidate.kind !== "snapshot" || !candidate.snapshot || consumed.has(other)) return;
                if (Math.abs(candidate.at - event.at) > RETURN_PAIR_WINDOW_MS) return;
                const previous = previousSnapshot(events, other);
                if (!previous) return;
                const gone = difference(previous.claims, candidate.snapshot.claims);
                const arrived = difference(candidate.snapshot.claims, previous.claims);
                if (gone.length !== 1 || arrived.length !== 1) return;
                if (best && Math.abs(events[best.index].at - event.at) <= Math.abs(candidate.at - event.at)) return;
                best = { index: other, out: gone[0], arrived: arrived[0] };
            });
            if (best) {
                consumed.add(best.index);
                entry.said = best.out;
                entry.says = best.arrived;
            }
        } else {
            entry.said = saidAt(events, event.at);
        }

        if (judgement.verdict === "rejected") {
            // The sentence you withdrew went to the thinking space (#562). When that thought is in
            // the window it belongs to this line, not to a row of its own.
            let nearest: number | undefined;
            events.forEach((candidate, other) => {
                if (candidate.kind !== "thought" || !candidate.thought || consumed.has(other)) return;
                if (Math.abs(candidate.at - event.at) > RETURN_PAIR_WINDOW_MS) return;
                if (
                    nearest !== undefined &&
                    Math.abs(events[nearest].at - event.at) <= Math.abs(candidate.at - event.at)
                ) {
                    return;
                }
                nearest = other;
            });
            if (nearest !== undefined) {
                consumed.add(nearest);
                entry.thought = events[nearest].thought;
            }
        }

        paired.set(index, entry);
    });

    if (paired.size === 0) return events;
    const out: TimelineEvent[] = [];
    events.forEach((event, index) => {
        if (consumed.has(index)) return;
        const entry = paired.get(index);
        out.push(entry ? { at: event.at, kind: "return", return: entry } : event);
    });
    return out;
}
