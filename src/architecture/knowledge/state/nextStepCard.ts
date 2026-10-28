import type { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import { proposedNextState } from "architecture/knowledge/lifecycle/machine";
import type { LifecycleState } from "architecture/knowledge/lifecycle/states";
import { suggestNextMoves } from "./nextMoveLogic";
import type { NearbyRow } from "./noteCompanion";

/**
 * The facts each next move rests on (#641) — what the card's sentence says, never a verdict on the
 * note. One per token `suggestNextMoves()` returns, in the order it returns them (D5).
 */
export type NextStepFact =
    /** The claims that cite nothing. */
    | { token: "add-source"; unsourced: number }
    | { token: "connect" }
    /** Where the note is and the state it would move to (Cultivate's proposal, one home). */
    | { token: "advance-state"; current: string; proposed: LifecycleState | null };

export type NextStepCard =
    /** A note the model does not know: no card at all, so it can never look finished. */
    | { kind: "absent" }
    /** Nothing pending. Said once, without a grade. */
    | { kind: "complete" }
    | { kind: "proposing"; moves: NextStepFact[] };

function fact(model: KnowledgeModel, path: string, token: NextStepFact["token"]): NextStepFact {
    const idea = model.get(path)!;
    switch (token) {
        case "add-source":
            return { token, unsourced: idea.claims.filter((claim) => claim.sources.length === 0).length };
        case "connect":
            return { token };
        case "advance-state":
            return { token, current: idea.state, proposed: proposedNextState(idea.state) };
    }
}

/**
 * The next-step card for one note: `suggestNextMoves()` mapped one to one into facts. It never
 * reorders, adds or drops a move.
 */
export function nextStepCard(model: KnowledgeModel, path: string): NextStepCard {
    if (!model.get(path)) return { kind: "absent" };
    const tokens = suggestNextMoves(model, path);
    if (tokens.length === 0) return { kind: "complete" };
    return { kind: "proposing", moves: tokens.map((token) => fact(model, path, token)) };
}

/**
 * The notes *Connect* offers: the nearby ones the note does not already link to, best first, at
 * most `limit`. The same ranking *Near and forgotten* reads, so the two never disagree.
 */
export function connectCandidates<R>(
    rows: readonly NearbyRow<R>[],
    linkedOut: ReadonlySet<string>,
    limit = 4
): NearbyRow<R>[] {
    return rows.filter((row) => !linkedOut.has(row.path)).slice(0, limit);
}
