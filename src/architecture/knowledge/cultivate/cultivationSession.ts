import type { KnowledgeModel } from "../model/KnowledgeModel";
import type { IdeaState } from "../model/Idea";
import { rankRelated } from "../relations/relationRankingLogic";
import { findContradictions } from "../query/findContradictionLogic";
import { computeMaturity } from "../derive/maturityLogic";
import { allowedTargets } from "../lifecycle/machine";
import { FALLBACK_STATE, isLifecycleState, type LifecycleState } from "../lifecycle/states";
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
}

export interface CultivationSession {
    path: string;
    state: IdeaState;
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
    if (proposedState) moves.push({ kind: "advance", proposedState });

    if (!idea.maturitySignals.hasSources) moves.push({ kind: "source" });

    return {
        path,
        state: idea.state,
        degree: idea.maturitySignals.degree,
        maturity: computeMaturity(model, path, now),
        moves,
    };
}

/**
 * Pick the highest-leverage idea to cultivate now (#309, S1): the `nextSession` heuristic
 * (well-connected yet under-developed), then the newest fleeting note, then the best-connected note.
 * Returns `null` for an empty model. Deterministic.
 */
export function selectCultivationTarget(model: KnowledgeModel): string | null {
    const next = nextSession(model);
    if (next) return next.path;

    const byPath = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
    const fleeting = byState(model, "fleeting").sort((a, b) => b.created - a.created || byPath(a.path, b.path));
    if (fleeting.length > 0) return fleeting[0].path;

    const all = model.all().sort((a, b) => b.maturitySignals.degree - a.maturitySignals.degree || byPath(a.path, b.path));
    return all.length > 0 ? all[0].path : null;
}
