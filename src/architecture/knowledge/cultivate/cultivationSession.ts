import type { KnowledgeModel } from "../model/KnowledgeModel";
import type { IdeaState } from "../model/Idea";
import { rankRelated } from "../relations/relationRankingLogic";
import { findContradictions } from "../query/findContradictionLogic";
import { computeMaturity } from "../derive/maturityLogic";
import { allowedTargets } from "../lifecycle/machine";
import { FALLBACK_STATE, isLifecycleState, STATE_EMOJI, STATE_LABEL_KEY, type LifecycleState } from "../lifecycle/states";
import { byState } from "../query/queries";
import { nextSession } from "../home/nextSession";

/**
 * The pure model of a **Cultivate** thinking session (#309): repositions the existing per-note
 * projections into an ordered set of cognitive *moves* that make one idea evolve. Obsidian-free,
 * deterministic, read-only — the surface renders these and applies them. Metrics are consequences of
 * the graph, never invented.
 */

/** A single cognitive move offered on the target idea. */
export type CultivationMoveKind = "connect" | "challenge" | "question" | "advance" | "source";

export interface CultivationMove {
    kind: CultivationMoveKind;
    /** connect: related notes to link; challenge: notes that contradict this one. */
    candidates?: string[];
    /** advance: the proposed next lifecycle state. */
    proposedState?: LifecycleState;
    /** advance: the i18n key for the proposed state's label (so the view needs no lifecycle import). */
    proposedStateLabelKey?: string;
}

export interface CultivationSession {
    path: string;
    state: IdeaState;
    /** Display-ready emoji for the current state (so the Experience view needs no lifecycle import). */
    stateEmoji: string;
    degree: number;
    /** #158 maturity at the start of the session, or null if unindexed — the "before" of before/after. */
    maturity: number | null;
    /** The actionable moves, in ritual order (connect → challenge → question → advance → source). */
    moves: CultivationMove[];
}

const CONNECT_LIMIT = 3;

function asLifecycleState(state: IdeaState): LifecycleState {
    return isLifecycleState(state) ? state : FALLBACK_STATE;
}

/**
 * Build the session for a target note (#309, S1). Composes: **connect** (find-related, top 3),
 * **challenge** (find-contradiction), **question** (always — you can always ask one), **advance** (the
 * next valid lifecycle state), **source** (only when the note is unsourced). Only actionable moves are
 * kept, so the session is exactly "what to do on this idea now". Returns `null` for an unknown path.
 */
export function buildCultivationSession(model: KnowledgeModel, path: string, now: number): CultivationSession | null {
    const idea = model.get(path);
    if (!idea) return null;

    const moves: CultivationMove[] = [];

    const related = rankRelated(model, path, { limit: CONNECT_LIMIT });
    if (related.length > 0) moves.push({ kind: "connect", candidates: related });

    const contradictions = findContradictions(model, path);
    // Challenge is always offered: if contradictions exist show them, otherwise invite a counterpoint.
    moves.push({ kind: "challenge", candidates: contradictions });

    // A question can always be raised.
    moves.push({ kind: "question" });

    const targets = allowedTargets(asLifecycleState(idea.state));
    const proposedState = targets.find((target) => target !== "archived") ?? targets[0];
    if (proposedState) {
        moves.push({ kind: "advance", proposedState, proposedStateLabelKey: STATE_LABEL_KEY[proposedState] });
    }

    if (!idea.maturitySignals.hasSources) moves.push({ kind: "source" });

    return {
        path,
        state: idea.state,
        stateEmoji: STATE_EMOJI[asLifecycleState(idea.state)] ?? "",
        degree: idea.maturitySignals.degree,
        maturity: computeMaturity(model, path, now),
        moves,
    };
}

/**
 * Pick the highest-leverage idea to cultivate now (#309, S1): the `nextSession` heuristic
 * (well-connected yet under-developed), then the newest fleeting note, then the best-connected note.
 * `exclude` skips notes already cultivated this sitting (the "another idea" action). Returns `null`
 * for an empty model or when everything is excluded. Deterministic.
 */
export function selectCultivationTarget(
    model: KnowledgeModel,
    exclude: ReadonlySet<string> = new Set()
): string | null {
    const byPath = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
    const ranked: string[] = [];

    const next = nextSession(model);
    if (next) ranked.push(next.path);
    for (const idea of byState(model, "fleeting").sort((a, b) => b.created - a.created || byPath(a.path, b.path))) {
        ranked.push(idea.path);
    }
    for (const idea of model.all().sort((a, b) => b.maturitySignals.degree - a.maturitySignals.degree || byPath(a.path, b.path))) {
        ranked.push(idea.path);
    }

    for (const path of ranked) {
        if (!exclude.has(path) && model.get(path)) return path;
    }
    return null;
}

/**
 * How many ideas still have development headroom (#309 S4): everything that isn't already `evergreen`
 * or `archived` — the pool a Cultivate session draws from. A consequence of the model, for the Home
 * on-ramp count. Pure.
 */
export function readyToCultivate(model: KnowledgeModel): number {
    let count = 0;
    for (const idea of model.all()) {
        if (idea.state !== "evergreen" && idea.state !== "archived") count++;
    }
    return count;
}
