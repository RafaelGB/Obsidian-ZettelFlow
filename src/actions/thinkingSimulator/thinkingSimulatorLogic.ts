import type { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import { findContradictions } from "architecture/knowledge/query/findContradictionLogic";

/**
 * The fixed vocabulary of critical-thinking prompts the simulator can raise for a note (#165).
 * Two kinds, always emitted in this order:
 * - **universal** — idea-agnostic challenges that apply to any claim (`assume-false`, `who-disagrees`,
 *   `extreme-case`, `hidden-assumption`), so the simulator is never empty (AC-3);
 * - **gap-adaptive** — a challenge fired only when the model shows that specific weakness (AC-1).
 */
export type PromptToken =
    | "assume-false"
    | "who-disagrees"
    | "extreme-case"
    | "hidden-assumption"
    | "needs-evidence"
    | "needs-counterpoint"
    | "needs-example"
    | "needs-connection"
    | "needs-question";

/** The always-on prompts — emitted first, for every note (AC-3). */
export const UNIVERSAL_PROMPT_TOKENS: readonly PromptToken[] = [
    "assume-false",
    "who-disagrees",
    "extreme-case",
    "hidden-assumption",
];

/** The gap-adaptive prompts, in the order they are appended when their precondition holds (AC-1). */
export const GAP_PROMPT_TOKENS: readonly PromptToken[] = [
    "needs-evidence",
    "needs-counterpoint",
    "needs-example",
    "needs-connection",
    "needs-question",
];

/**
 * Pure critical-thinking simulator (#165, FR-2..FR-5). Returns the universal prompts followed by
 * every gap-adaptive prompt whose precondition holds in the model:
 * - `needs-evidence` — the note makes a claim but has no source (#148);
 * - `needs-counterpoint` — nothing contradicts it (no `contradicts` relation in or out, #147);
 * - `needs-example` — it declares no outgoing `example` relation (#147);
 * - `needs-connection` — nobody builds on it (`inDegree === 0`, orphan);
 * - `needs-question` — it raises no open `question` (#147).
 *
 * Adapts to the note's real gaps yet is never empty: an unknown/unindexed target still yields the
 * four universal prompts (never `[]`). Reads only the {@link KnowledgeModel}; deterministic,
 * read-only, never throws. Obsidian-free (reuses the #153 `findContradictions`, not the barrel).
 */
export function criticalThinkingPrompts(model: KnowledgeModel, path: string): PromptToken[] {
    const prompts: PromptToken[] = [...UNIVERSAL_PROMPT_TOKENS];

    const idea = model.get(path);
    if (!idea) return prompts;

    const signals = idea.maturitySignals;

    if (idea.claims.length > 0 && !signals.hasSources) prompts.push("needs-evidence");
    if (findContradictions(model, path).length === 0) prompts.push("needs-counterpoint");
    if (!idea.relations.some((relation) => relation.type === "example")) prompts.push("needs-example");
    if (signals.inDegree === 0) prompts.push("needs-connection");
    if (!idea.relations.some((relation) => relation.type === "question")) prompts.push("needs-question");

    return prompts;
}
