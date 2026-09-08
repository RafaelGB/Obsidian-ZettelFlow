import type { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import {
    rankRelatedScored,
    type RankRelatedOptions,
    type ScoredRelated,
} from "architecture/knowledge/relations/relationRankingLogic";
import { reasoningPaths } from "./reasoningPaths";

/**
 * Authored reasoning paths (#363, D3) — the read side of *building* an argument, not just reading one.
 * {@link reasoningPaths} shows the chains the graph already encodes; this proposes the **next link** to
 * extend one. It only *proposes*: which role a link plays, and whether to add it at all, is the user's
 * verdict ([constitution §XII](../../../../docs/development/constitution.md)) — nothing here writes.
 */

/** The role a proposed link plays in the argument. The label is the user's; the relation is committed on accept. */
export const ARGUMENT_ROLES = ["reason", "counter", "example", "response"] as const;
export type ArgumentRole = (typeof ARGUMENT_ROLES)[number];

/** Which semantic relation each role would commit, when the user chooses to add it through the normal gated flow. */
export const ROLE_RELATION: Record<ArgumentRole, string> = {
    reason: "supports",
    counter: "contradicts",
    example: "example",
    response: "supports",
};

/** One proposed next link: a related note and how related it is. The role is the user's to choose. */
export type ReasoningLinkCandidate = ScoredRelated;

/**
 * Propose the next links that would **extend** the argument from `start` (#363, D3): the notes most
 * related to it by shared graph context ({@link rankRelatedScored}) that are **not already part of its
 * reasoning chain** — so each is a genuinely new branch to weigh, never one the chain already contains.
 * Pure, deterministic, read-only, Obsidian-free; an unknown/unindexed start yields `[]`.
 */
export function proposeReasoningLinks(
    model: KnowledgeModel,
    start: string,
    opts: RankRelatedOptions = {}
): ReasoningLinkCandidate[] {
    const reachable = new Set<string>([start]);
    for (const path of reasoningPaths(model, start)) {
        for (const step of path.steps) reachable.add(step.to);
    }
    return rankRelatedScored(model, start, opts).filter((candidate) => !reachable.has(candidate.path));
}
