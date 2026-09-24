import type { Judgement } from "architecture/knowledge/judgement";
import type { Move } from "application/thinking/move";
import type { Snapshot } from "./recordSnapshot";
import { CLAIM_SUBJECT_PREFIX } from "architecture/knowledge/claims/keys";
import { STATE_SUBJECT_PREFIX } from "architecture/knowledge/lifecycle/states";

/**
 * What a point on the timeline is: a conceptual snapshot (#168), a recorded verdict (#336), a
 * **move** (#494), a **thought written about the note** (#540), or a **return** (#564) — what
 * changed, what you ruled, what you did, what you thought, and what you now say.
 */
export type TimelineEventKind =
    | "snapshot"
    | "judgement"
    | "move"
    | "thought"
    | "return"
    | "promotion"
    | "horizon";

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
 * A note you promoted (#581).
 *
 * The same shape as a return and deliberately **not** the same object: `said`/`says` name
 * *sentences*, and a lifecycle token printed under "It said" would misdescribe the row. What this
 * carries is the state it became — the state it came from is the snapshot before it, which the
 * timeline is already showing.
 */
export interface PromotionEvent {
    /** The state it became, as a token. The row looks its label up; the record never held one. */
    to: string;
    judgement: Judgement;
}

/**
 * A day you expect to know by (#572).
 *
 * The first thing this axis has ever drawn that **has not happened**. Every other event is a log
 * entry — a snapshot, a verdict, a move, a thought — and a horizon is none of those: it is a date
 * you set, sitting to the right of today until it arrives.
 */
export interface HorizonEvent {
    /** What you expect to see. */
    expectation: string;
    /** The day, as a local day start. */
    at: number;
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
    /** Present when `kind === "promotion"` (#581). */
    promotion?: PromotionEvent;
    /** Present when `kind === "horizon"` (#572). The only event that has not happened. */
    horizon?: HorizonEvent;
}

// A return sits where its verdict sat, because that is the moment it describes.
const RANK: Record<TimelineEventKind, number> = {
    snapshot: 0,
    judgement: 1,
    return: 1,
    promotion: 1,
    move: 2,
    thought: 3,
    // Last on a tie, because a day you expect to know by is not something that happened then.
    horizon: 4,
};

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
    thoughts: readonly ThoughtRef[] = [],
    /**
     * The wager this note is holding, if it holds one (#572). Default-absent, like every strand
     * before it, so a note without one renders exactly as it did.
     */
    horizon?: HorizonEvent
): TimelineEvent[] {
    const events: TimelineEvent[] = [];
    for (const snapshot of snapshots) events.push({ at: snapshot.at, kind: "snapshot", snapshot });
    for (const judgement of judgements) events.push({ at: judgement.at, kind: "judgement", judgement });
    for (const move of moves) events.push({ at: move.at, kind: "move", move });
    for (const thought of thoughts) events.push({ at: thought.at, kind: "thought", thought });
    events.sort((a, b) => a.at - b.at || kindRank(a.kind) - kindRank(b.kind));

    // **After** the joins, never into them. `pairReturns` exists to refuse a coincidence becoming a
    // sentence, and feeding it an event that can be neither half of one is how it would start
    // fabricating them. Inserting afterwards makes #564's and #581's output identical by
    // construction — asserted, not assumed.
    return withHorizon(pairReturns(events), horizon);
}

/** Put the day you expect to know by where it belongs in time — which is usually last. */
function withHorizon(events: TimelineEvent[], horizon?: HorizonEvent): TimelineEvent[] {
    if (!horizon) return events;
    const mark: TimelineEvent = { at: horizon.at, kind: "horizon", horizon };
    const before = events.filter((event) => event.at <= horizon.at);
    const after = events.filter((event) => event.at > horizon.at);
    return [...before, mark, ...after];
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

/** Whether two claim sets hold the same sentences, order-insensitively. */
function sameClaims(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && difference(a, b).length === 0;
}

/**
 * The nearest unconsumed snapshot inside the window that `accept` is happy with.
 *
 * One join for both kinds of verdict (#581). What differs between a rewritten claim and a promoted
 * note is only *which snapshot counts*, so that is the parameter and the rest is shared — a second
 * pairing mechanism is exactly what #564 forbade when it wrote the first one.
 */
function nearestSnapshot(
    events: readonly TimelineEvent[],
    at: number,
    consumed: ReadonlySet<number>,
    accept: (snapshot: Snapshot, previous: Snapshot | undefined) => boolean
): number | undefined {
    let best: number | undefined;
    events.forEach((candidate, index) => {
        if (candidate.kind !== "snapshot" || !candidate.snapshot || consumed.has(index)) return;
        if (Math.abs(candidate.at - at) > RETURN_PAIR_WINDOW_MS) return;
        if (!accept(candidate.snapshot, previousSnapshot(events, index))) return;
        if (best !== undefined && Math.abs(events[best].at - at) <= Math.abs(candidate.at - at)) return;
        best = index;
    });
    return best;
}

/**
 * Tell a verdict and the change it caused as **one** event (#564, generalised in #581).
 *
 * Pure, and conservative by construction: a verdict it cannot pair renders as the judgement it
 * always was. Two subjects are understood — a claim you were asked about again, and a note you
 * promoted — and the window is the same five minutes for both.
 */
function pairReturns(events: TimelineEvent[]): TimelineEvent[] {
    const consumed = new Set<number>();
    const paired = new Map<number, TimelineEvent>();

    events.forEach((event, index) => {
        const judgement = event.judgement;
        if (event.kind !== "judgement" || !judgement) return;
        const subject = judgement.subject ?? "";

        if (subject.startsWith(CLAIM_SUBJECT_PREFIX)) {
            const entry: ReturnEvent = { verdict: judgement.verdict, judgement };

            if (judgement.verdict === "modified") {
                // The snapshot this verdict produced: only when the claim set moved by exactly one
                // sentence out and one in. Two-for-two is a bulk edit, and pairing it would invent
                // a story.
                let moved: { out: string; arrived: string } | undefined;
                const at = nearestSnapshot(events, event.at, consumed, (snapshot, previous) => {
                    if (!previous) return false;
                    const gone = difference(previous.claims, snapshot.claims);
                    const arrived = difference(snapshot.claims, previous.claims);
                    if (gone.length !== 1 || arrived.length !== 1) return false;
                    moved = { out: gone[0], arrived: arrived[0] };
                    return true;
                });
                if (at !== undefined && moved) {
                    consumed.add(at);
                    entry.said = moved.out;
                    entry.says = moved.arrived;
                }
            } else {
                entry.said = saidAt(events, event.at);
            }

            if (judgement.verdict === "rejected") {
                // The sentence you withdrew went to the thinking space (#562). When that thought is
                // in the window it belongs to this line, not to a row of its own.
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

            paired.set(index, { at: event.at, kind: "return", return: entry });
            return;
        }

        if (subject.startsWith(STATE_SUBJECT_PREFIX)) {
            const to = subject.slice(STATE_SUBJECT_PREFIX.length);
            // Two extra refusals beyond the window, both there to stop a coincidence becoming a
            // sentence: the snapshot has to *be* the state this verdict names, and a snapshot where
            // the claims moved too is two things happening, so it stays two rows.
            const at = nearestSnapshot(events, event.at, consumed, (snapshot, previous) => {
                if (snapshot.state !== to || !previous) return false;
                if (previous.state === snapshot.state) return false;
                return sameClaims(previous.claims, snapshot.claims);
            });
            if (at !== undefined) consumed.add(at);
            paired.set(index, { at: event.at, kind: "promotion", promotion: { to, judgement } });
        }
    });

    if (paired.size === 0) return events;
    const out: TimelineEvent[] = [];
    events.forEach((event, index) => {
        if (consumed.has(index)) return;
        out.push(paired.get(index) ?? event);
    });
    return out;
}
