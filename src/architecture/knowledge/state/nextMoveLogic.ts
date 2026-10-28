import type { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import { STATE_FACTOR } from "architecture/knowledge/derive/maturityLogic";

/** The fixed, ordered vocabulary of concrete next moves an idea can be nudged toward (#158). */
export type NextMoveToken = "add-source" | "connect" | "advance-state";

export const NEXT_MOVE_TOKENS: readonly NextMoveToken[] = [
    "add-source",
    "connect",
    "advance-state",
];

/** A state factor at/above this is "developed enough" — no advance-state nudge (matches #153 STATE_FACTOR). */
const DEVELOPED_STATE_FACTOR = 0.8;

/**
 * Pure next-move suggestion (#158, FR-2/FR-3/FR-4). From an idea's model signals, returns the
 * ordered subset of {@link NEXT_MOVE_TOKENS} whose precondition holds (*add an example* was
 * dropped in #891: nobody understood it, and its direction contradicted the relation vocabulary):
 * - `add-source` — makes a claim but has no source;
 * - `connect` — has no outgoing links;
 * - `advance-state` — sits in an early lifecycle state (factor < 0.8, excluding `archived`).
 *
 * A fully-developed idea returns `[]` ("complete"); any non-complete idea returns ≥1 token (AC-2).
 * Reads only the {@link KnowledgeModel}; deterministic, read-only, never throws. An absent/unindexed
 * target yields `[]`. Obsidian-free (imports the #153 `STATE_FACTOR`, not the knowledge barrel).
 */
export function suggestNextMoves(model: KnowledgeModel, path: string): NextMoveToken[] {
    const idea = model.get(path);
    if (!idea) return [];

    const moves: NextMoveToken[] = [];
    const signals = idea.maturitySignals;

    if (idea.claims.length > 0 && !signals.hasSources) moves.push("add-source");
    if (signals.outDegree === 0) moves.push("connect");
    const factor = STATE_FACTOR[idea.state] ?? 0;
    if (factor < DEVELOPED_STATE_FACTOR && idea.state !== "archived") moves.push("advance-state");

    return moves;
}
