import type { TimelineEvent } from "./timelineEvents";
import type { TrajectoryDirection } from "architecture/knowledge/state/trajectory";
import type { JudgementOrigin, JudgementVerdict } from "architecture/knowledge/judgement/Judgement";

/**
 * The **shareable idea card** model (#387, B4) — a pure before→after summary of how one note's *thinking*
 * evolved, assembled from **already-accepted data only**: the opt-in conceptual snapshots (#168), the
 * recorded judgements (#336) and the note's current model degree. It **writes nothing** and introduces
 * **no new interpretation** — every field is a mechanical fact already in the model (§XII satisfied by
 * construction). The renderer paints this onto a canvas and hands it to the export helper.
 */

const DAY = 86_400_000;

/** A judgement milestone on the card — a recorded verdict, locale-free. */
export interface IdeaCardMilestone {
    at: number;
    verdict: JudgementVerdict;
    origin: JudgementOrigin;
}

/** Inputs for {@link buildIdeaCard} — shipped shapes only, no live vault. */
export interface IdeaCardInput {
    /** The note path (identity). */
    path: string;
    /** The merged, time-ordered event stream for this note (snapshots + judgements). */
    events: readonly TimelineEvent[];
    /** Current model degree (link count) — an absolute mechanical fact. */
    linksNow: number;
    /** The note's cognitive direction from its trajectory row, or `null` when it has none. */
    direction?: TrajectoryDirection | null;
}

/** The before→after card for one idea. */
export interface IdeaCard {
    path: string;
    /** Display title (basename, folder + `.md` stripped). */
    title: string;
    firstState: string;
    currentState: string;
    stateChanged: boolean;
    claimsFirst: number;
    claimsCurrent: number;
    /** Honest before→after claim delta (current − first). */
    claimsGained: number;
    /** What it said first, when a snapshot recorded one (#564). */
    claimFirst?: string;
    /** What it says now. */
    claimCurrent?: string;
    /** Whether those are two different sentences — the before/after this card exists for. */
    claimChanged: boolean;
    /** Current link count (degree) — an absolute fact, not a delta (snapshots store no link history). */
    linksNow: number;
    /** Recorded verdicts, in time order. */
    milestones: IdeaCardMilestone[];
    milestoneCount: number;
    direction: TrajectoryDirection | null;
    /** Span from the first to the last event (ms), and in whole days. */
    elapsedMs: number;
    elapsedDays: number;
}

function baseName(path: string): string {
    const file = path.split("/").pop() ?? path;
    return file.replace(/\.md$/i, "");
}

/**
 * Build the idea card from a note's timeline (#387). Returns `null` when there are no events to describe.
 * The before/after states and claim counts come from the first vs last **snapshot**; milestones are the
 * recorded judgements; `linksNow` is the current degree. Pure, deterministic, never mutates its input.
 */
export function buildIdeaCard(input: IdeaCardInput): IdeaCard | null {
    const events = input.events;
    if (events.length === 0) return null;

    const snapshots = events.filter((event) => event.kind === "snapshot" && event.snapshot).map((event) => event.snapshot!);
    // A return (#564) *is* a judgement — it is the verdict and the change it caused, told as one
    // event. Reading only `kind === "judgement"` here would quietly drop every milestone the
    // moment the pairing shipped.
    const milestones: IdeaCardMilestone[] = events
        .map((event) => event.judgement ?? event.return?.judgement)
        .filter((judgement): judgement is NonNullable<typeof judgement> => judgement !== undefined)
        .map((judgement) => ({ at: judgement.at, verdict: judgement.verdict, origin: judgement.origin }));

    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];
    const firstState = first?.state ?? "";
    const currentState = last?.state ?? "";
    const claimsFirst = first?.claims.length ?? 0;
    const claimsCurrent = last?.claims.length ?? 0;
    // The sentences themselves, not only how many there were (#564). The card has been able to
    // say "this idea grew" since #387; it could not say **what it said then and says now**,
    // which is the only before/after anybody wants to read.
    const claimFirst = first?.claims[0];
    const claimCurrent = last?.claims[0];

    const firstAt = events[0].at;
    const lastAt = events[events.length - 1].at;
    const elapsedMs = Math.max(0, lastAt - firstAt);

    return {
        path: input.path,
        title: baseName(input.path),
        firstState,
        currentState,
        stateChanged: snapshots.length > 1 && firstState !== currentState,
        claimsFirst,
        claimsCurrent,
        claimsGained: claimsCurrent - claimsFirst,
        ...(claimFirst === undefined ? {} : { claimFirst }),
        ...(claimCurrent === undefined ? {} : { claimCurrent }),
        claimChanged: claimFirst !== undefined && claimCurrent !== undefined && claimFirst !== claimCurrent,
        linksNow: input.linksNow,
        milestones,
        milestoneCount: milestones.length,
        direction: input.direction ?? null,
        elapsedMs,
        elapsedDays: Math.floor(elapsedMs / DAY),
    };
}
