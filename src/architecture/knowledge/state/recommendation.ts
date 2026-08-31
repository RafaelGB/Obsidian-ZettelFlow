import type { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import { computeKnowledgeDebt } from "architecture/knowledge/debt/knowledgeDebt";
import { computeKnowledgeBalance } from "architecture/knowledge/balance/knowledgeBalance";
import { findDiscoveries } from "architecture/knowledge/discovery/discoveries";
import { byState, edgesByType } from "architecture/knowledge/query/queries";
import { unexaminedIdeas } from "architecture/knowledge/judgement/unexamined";
import type { Judgement } from "architecture/knowledge/judgement/Judgement";

/**
 * The **`KnowledgeRecommendation` primitive** (#267, epic #262 Phase 5) — the one shape for
 * "what should I do next", the last leg of `Query → State → Recommendation → Command`.
 *
 * A recommendation is a **pure consequence of the model** (metrics are consequences, not inventions):
 * it names *why* (a closed `reason`), *what* it concerns (`target` note paths), the **Command** that
 * would resolve it (a `kind:"command"` action id, or `null` when no built-in command applies yet), and
 * a `priority` in [0,1]. §XI: this module is offline and obsidian-free, and imports the projections it
 * composes by **deep path**, never the `architecture/knowledge` barrel.
 *
 * It **unifies** the six bespoke "next-step" vocabularies scattered across the codebase — the pure
 * `from*` mappers below prove every one of their cases collapses onto a single `reason`.
 */

/** Why a recommendation exists — the closed, locale-free reason union. */
export const RECOMMENDATION_REASONS = [
    "resolve-contradiction",
    "add-source",
    "connect",
    "answer-question",
    "advance-state",
    "re-engage",
    "develop-hub",
    "process-ideas",
    "review-note",
    "add-examples",
    "ask-questions",
    "reduce-debt",
    "all-clear",
] as const;
export type RecommendationReason = (typeof RECOMMENDATION_REASONS)[number];

/** The shipped `kind:"command"` action ids a recommendation may point at (Phase 3). */
export const COMMAND_ACTION_IDS = [
    "selector",
    "prompt",
    "number",
    "calendar",
    "checkbox",
    "tags",
    "cssclasses",
    "script",
    "task-management",
    "dynamic-selector",
    "zettel-id",
    "backlink",
    "create-semantic-relation",
    "attach-source",
] as const;
export type CommandActionId = (typeof COMMAND_ACTION_IDS)[number];

/** The Command that resolves a reason, or `null` when no built-in command applies yet (#268 wires more). */
export const REASON_COMMAND: Record<RecommendationReason, CommandActionId | null> = {
    "resolve-contradiction": null,
    "add-source": "attach-source",
    "connect": "create-semantic-relation",
    "answer-question": null,
    "advance-state": null,
    "re-engage": null, // the move is to cultivate the idea, which no single action id covers
    "develop-hub": null,
    "process-ideas": null,
    "review-note": null,
    "add-examples": null,
    "ask-questions": null,
    "reduce-debt": null,
    "all-clear": null,
};

/** Base urgency per reason, in [0,1] — gives a stable, deterministic priority-desc order. */
const REASON_PRIORITY: Record<RecommendationReason, number> = {
    "resolve-contradiction": 0.9,
    "add-source": 0.8,
    "connect": 0.7,
    "answer-question": 0.6,
    "advance-state": 0.55,
    "re-engage": 0.52, // below advancing a state, above processing the inbox
    "process-ideas": 0.5,
    "develop-hub": 0.5,
    "review-note": 0.45,
    "add-examples": 0.4,
    "ask-questions": 0.4,
    "reduce-debt": 0.3,
    "all-clear": 0,
};

export interface KnowledgeRecommendation {
    /** Why — a member of {@link RECOMMENDATION_REASONS}. */
    reason: RecommendationReason;
    /** The note path(s) the recommendation concerns; empty for a vault-wide suggestion. */
    target: string[];
    /** The Command that resolves it, or `null` when no built-in command applies yet. */
    command: CommandActionId | null;
    /** Urgency in [0,1]. */
    priority: number;
}

function rec(reason: RecommendationReason, target: string[]): KnowledgeRecommendation {
    return { reason, target, command: REASON_COMMAND[reason], priority: REASON_PRIORITY[reason] };
}

/** Map a debt category to the reason it remediates. */
function reasonForDebtCategory(key: string): RecommendationReason {
    switch (key) {
        case "unsourced":
            return "add-source";
        case "open-question":
            return "answer-question";
        default: // unreferenced / dangling
            return "connect";
    }
}

/**
 * Derive the vault's recommendations from the model — deterministic, offline, read-only, never throws.
 * Empty model ⇒ `[]`. Sorted by priority desc, then reason order, then target for a stable order.
 */
export function deriveRecommendations(
    model: KnowledgeModel,
    /**
     * The judgement record (#336). Optional: with no history there is nothing to say about agency, so
     * every existing caller keeps its exact behaviour.
     */
    history?: readonly Judgement[]
): KnowledgeRecommendation[] {
    const out: KnowledgeRecommendation[] = [];

    // Debt categories (unsourced → add-source, unreferenced/dangling → connect, open-question → answer).
    for (const cat of computeKnowledgeDebt(model).categories) {
        if (cat.count > 0) out.push(rec(reasonForDebtCategory(cat.key), [...cat.paths]));
    }

    // Contradictions worth resolving.
    const contradictions = edgesByType(model, "contradicts");
    if (contradictions.length > 0) {
        const paths = Array.from(new Set(contradictions.flatMap((e) => [e.from, e.to]))).sort();
        out.push(rec("resolve-contradiction", paths));
    }

    // Unexplored connections (discoveries) — a connection to make.
    for (const d of findDiscoveries(model)) {
        out.push(rec("connect", [d.a, d.b].sort()));
    }

    // Fleeting notes to process.
    const fleeting = byState(model, "fleeting").map((i) => i.path).sort();
    if (fleeting.length > 0) out.push(rec("process-ideas", fleeting));

    // Ideas that grew structurally while you never ruled on them (#339). Names the ideas, never a
    // grade about the user.
    if (history) {
        const unexamined = unexaminedIdeas(model, history).map((entry) => entry.path);
        if (unexamined.length > 0) out.push(rec("re-engage", unexamined));
    }

    // Vault-wide composition suggestions (add-examples / ask-questions / add-sources).
    for (const suggestion of computeKnowledgeBalance(model).suggestions) {
        out.push(rec(fromBalance(suggestion), []));
    }

    const reasonIndex = (r: RecommendationReason) => RECOMMENDATION_REASONS.indexOf(r);
    return out.sort((a, b) =>
        b.priority - a.priority ||
        reasonIndex(a.reason) - reasonIndex(b.reason) ||
        a.target.join(",").localeCompare(b.target.join(","))
    );
}

// ─── Unification: the six bespoke next-step vocabularies collapse onto one reason ────────────────

/** dashboard `RecommendationToken` → reason. */
export function fromDashboardToken(token: string): RecommendationReason {
    switch (token) {
        case "connect-orphans":
        case "make-connections":
            return "connect";
        case "reduce-debt":
            return "reduce-debt";
        case "resolve-contradictions":
            return "resolve-contradiction";
        case "answer-questions":
            return "answer-question";
        case "process-ideas":
            return "process-ideas";
        default: // all-connected / debt-clear / all-clear
            return "all-clear";
    }
}

/** debt `RemediationToken` → reason. */
export function fromDebt(token: string): RecommendationReason {
    switch (token) {
        case "add-source":
            return "add-source";
        case "answer-question":
            return "answer-question";
        default: // connect
            return "connect";
    }
}

/** balance `BalanceSuggestion` → reason. */
export function fromBalance(suggestion: string): RecommendationReason {
    switch (suggestion) {
        case "add-sources":
            return "add-source";
        case "add-examples":
            return "add-examples";
        default: // ask-questions
            return "ask-questions";
    }
}

/** review `ReviewAction` → reason. */
export function fromReview(action: string): RecommendationReason {
    switch (action) {
        case "connect":
            return "connect";
        default: // open / review
            return "review-note";
    }
}

/** home `NextSession.reason` → reason. */
export function fromNextSession(reason: string): RecommendationReason {
    switch (reason) {
        case "develop-hub":
            return "develop-hub";
        default:
            return "develop-hub";
    }
}

/** action `NextMoveToken` → reason. */
export function fromNextMove(token: string): RecommendationReason {
    switch (token) {
        case "add-source":
            return "add-source";
        case "connect":
            return "connect";
        case "add-example":
            return "add-examples";
        default: // advance-state
            return "advance-state";
    }
}
