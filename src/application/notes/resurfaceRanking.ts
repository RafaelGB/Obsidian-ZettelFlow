/**
 * Pure ranking core for connection resurfacing ("talk to your slip-box", Feature 6).
 *
 * Obsidian-free: the {@link ResurfaceView} gathers the active note's signals and candidate
 * notes from the `metadataCache` / vault and hands them here to be scored. Given the currently
 * active note, this surfaces a bounded, ranked list of OLDER, RELATED notes worth revisiting.
 *
 * It is a RICHER ranking than {@link ../notes/connectionSuggestions} (which only scores
 * tag + title-keyword overlap): here we also score link/backlink overlap and add a small
 * recency bias that nudges less-recently-touched notes up. Kept as a separate module on purpose.
 */

/** Default upper bound on how many resurfaced notes are surfaced. */
export const DEFAULT_MAX_RESURFACED = 5;

/** Weight added per shared tag. Tags are the strongest relatedness signal. */
const TAG_WEIGHT = 3;
/** Weight added per link relationship (direct link, backlink, or shared link target). */
const LINK_WEIGHT = 2;

/**
 * Recency bias — a deliberately SMALL tie-breaker that favours notes you have not touched in a
 * while. Bounded in [0, RECENCY_MAX_BOOST) so it can only break ties / nudge; it can never flip a
 * candidate above another that has strictly more tag/link overlap (the smallest overlap unit is
 * {@link LINK_WEIGHT} = 2, and RECENCY_MAX_BOOST < 1). Older notes (smaller `lastOpenedOrModified`,
 * hence larger age) get a larger boost.
 *
 * Formula: boost = RECENCY_MAX_BOOST * age / (age + RECENCY_HALF_LIFE_MS), where
 * age = max(0, now - lastOpenedOrModified). This is a smooth, monotonically increasing,
 * asymptotically bounded function of age.
 */
const RECENCY_MAX_BOOST = 0.99;
const RECENCY_HALF_LIFE_MS = 1000 * 60 * 60 * 24 * 30; // ~30 days

export type ResurfaceReasonKind = "tag" | "link" | "backlink";

export interface ResurfaceCandidate {
    path: string;
    basename: string;
    tags: string[];
    /** Resolved target paths this candidate links to. */
    outgoingLinks: string[];
    /** Paths that link TO this candidate. */
    backlinks: string[];
    /** ms epoch; larger = more recent. */
    lastOpenedOrModified: number;
}

export interface ActiveNoteSignals {
    path: string;
    tags: string[];
    /** Resolved target paths the active note links to. */
    outgoingLinks: string[];
    /** Paths linking to the active note. */
    backlinks: string[];
}

export interface ResurfaceReason {
    kind: ResurfaceReasonKind;
    /** Shared items behind this reason (tag names or shared link-target paths). */
    shared: string[];
}

export interface ResurfacedNote {
    path: string;
    basename: string;
    score: number;
    reasons: ResurfaceReason[];
}

export interface RankResurfaceInput {
    active: ActiveNoteSignals;
    candidates: ResurfaceCandidate[];
    /** Injected clock (ms) for deterministic recency scoring. */
    now: number;
    max?: number;
    /** e.g. unresolved links, the active note itself. */
    excludePaths?: string[];
}

/**
 * Bounded recency boost in [0, RECENCY_MAX_BOOST). Older notes score higher. See the constant
 * docblock for the formula and why the bound guarantees recency never dominates overlap.
 */
function recencyBoost(now: number, lastOpenedOrModified: number): number {
    const age = Math.max(0, now - lastOpenedOrModified);
    return RECENCY_MAX_BOOST * (age / (age + RECENCY_HALF_LIFE_MS));
}

/**
 * Scores candidate notes against the active note's tags, outgoing links and backlinks, and
 * returns a bounded, relevance-ordered list of older/related notes worth revisiting.
 *
 * A candidate must share at least one tag/link (overlap score > 0 BEFORE recency) to appear —
 * recency alone never surfaces an unrelated note here (that serendipity lives in
 * {@link pickDailySpark}). The active note itself and any `excludePaths` are omitted.
 *
 * Sort: score desc, then `lastOpenedOrModified` asc (older first), then basename asc.
 */
export function rankResurfacedNotes(input: RankResurfaceInput): ResurfacedNote[] {
    const { active, candidates, now, max = DEFAULT_MAX_RESURFACED, excludePaths = [] } = input;

    const activeTags = new Set(active.tags);
    const activeOutgoing = new Set(active.outgoingLinks);
    const excluded = new Set([active.path, ...excludePaths]);

    const ranked: ResurfacedNote[] = [];
    for (const candidate of candidates) {
        if (excluded.has(candidate.path)) continue;

        const reasons: ResurfaceReason[] = [];
        let overlapScore = 0;

        // Tag overlap.
        const sharedTags = candidate.tags.filter((tag) => activeTags.has(tag));
        if (sharedTags.length > 0) {
            overlapScore += sharedTags.length * TAG_WEIGHT;
            reasons.push({ kind: "tag", shared: sharedTags });
        }

        // Direct link: the active note links to this candidate.
        if (activeOutgoing.has(candidate.path)) {
            overlapScore += LINK_WEIGHT;
            reasons.push({ kind: "link", shared: [] });
        }

        // Backlink: this candidate links to the active note.
        if (candidate.outgoingLinks.includes(active.path)) {
            overlapScore += LINK_WEIGHT;
            reasons.push({ kind: "backlink", shared: [] });
        }

        // Shared outgoing-link targets: both link to the same third notes.
        const sharedTargets = candidate.outgoingLinks.filter(
            (target) => target !== active.path && activeOutgoing.has(target)
        );
        if (sharedTargets.length > 0) {
            overlapScore += sharedTargets.length * LINK_WEIGHT;
            reasons.push({ kind: "link", shared: sharedTargets });
        }

        // Recency alone must NOT surface an unrelated note.
        if (overlapScore <= 0) continue;

        const score = overlapScore + recencyBoost(now, candidate.lastOpenedOrModified);
        ranked.push({ path: candidate.path, basename: candidate.basename, score, reasons });
    }

    ranked.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const aTime = candidateTime(candidates, a.path);
        const bTime = candidateTime(candidates, b.path);
        if (aTime !== bTime) return aTime - bTime; // older first
        return a.basename.localeCompare(b.basename);
    });

    return ranked.slice(0, Math.max(0, max));
}

/** Look up a candidate's `lastOpenedOrModified` by path for the secondary (older-first) tie-break. */
function candidateTime(candidates: ResurfaceCandidate[], path: string): number {
    const match = candidates.find((candidate) => candidate.path === path);
    return match ? match.lastOpenedOrModified : 0;
}

/**
 * Daily spark — a serendipity surface. Returns up to `count` candidates biased toward the LEAST
 * recently opened/modified (oldest first), excluding `excludePaths`. Unlike
 * {@link rankResurfacedNotes} this does NOT require any tag/link overlap: it deliberately surfaces
 * notes you have not touched in a while so old ideas can resurface. Deterministic given inputs
 * (sort by `lastOpenedOrModified` asc, then basename).
 *
 * `now` is accepted for signature symmetry with {@link rankResurfacedNotes} and future clock-based
 * tuning; the ordering itself is purely relative and does not depend on it.
 */
export function pickDailySpark(
    candidates: ResurfaceCandidate[],
    now: number,
    count: number,
    excludePaths?: string[]
): ResurfaceCandidate[] {
    const excluded = new Set(excludePaths ?? []);
    const pool = candidates.filter((candidate) => !excluded.has(candidate.path));
    pool.sort(
        (a, b) =>
            (a.lastOpenedOrModified - b.lastOpenedOrModified) || a.basename.localeCompare(b.basename)
    );
    return pool.slice(0, Math.max(0, count));
}
