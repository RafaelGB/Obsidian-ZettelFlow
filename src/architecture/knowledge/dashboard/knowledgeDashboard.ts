import type { KnowledgeModel } from "../model/KnowledgeModel";
import { computeKnowledgeDebt, severityBucket } from "../debt/knowledgeDebt";
import { findDiscoveries } from "../discovery/discoveries";
import { openQuestions } from "../questions/openQuestions";
import { byState, edgesByType } from "../query/queries";

/** The recommended next action a panel proposes — a locale-free token the view maps to a surface. */
export type RecommendationToken =
    | "connect-orphans"
    | "all-connected"
    | "reduce-debt"
    | "debt-clear"
    | "resolve-contradictions"
    | "answer-questions"
    | "process-ideas"
    | "make-connections"
    | "all-clear";

/** One number on a panel — a count, an optional percentage of the vault, and an optional band. */
export interface Metric {
    key: string;
    count: number;
    percent?: number;
    band?: string;
}

/** Every panel proposes exactly one next action (#171) — the count is the items it concerns. */
export interface Recommendation {
    token: RecommendationToken;
    count: number;
}

export interface DashboardPanel {
    key: "connectivity" | "debt" | "today";
    metrics: Metric[];
    recommendation: Recommendation;
}

/** The state of your knowledge system as an ops console (#171) — an ordered list of panels. */
export interface DashboardModel {
    panels: DashboardPanel[];
}

/** The single most-pressing next action for the "today" panel, in a fixed priority order. */
function todayRecommendation(
    contradictions: number,
    questions: number,
    process: number,
    connections: number
): Recommendation {
    if (contradictions > 0) return { token: "resolve-contradictions", count: contradictions };
    if (questions > 0) return { token: "answer-questions", count: questions };
    if (process > 0) return { token: "process-ideas", count: process };
    if (connections > 0) return { token: "make-connections", count: connections };
    return { token: "all-clear", count: 0 };
}

/**
 * Pure ops-console aggregate (#171). Composes existing State-layer functions into three panels —
 * **connectivity** (connected `degree>=1` / orphaned `degree===0` / unresolved = a dangling out-edge),
 * **debt** (the #159 `computeKnowledgeDebt` score + band), and **today** (fleeting to process,
 * `contradicts` edges, #163 discoveries to connect, #167 open questions) — each panel carrying one
 * recommendation. Invents no metric. Deterministic, read-only, never throws; empty model ⇒ three
 * zeroed panels with `all-connected`/`debt-clear`/`all-clear`. Obsidian-free.
 */
export function buildKnowledgeDashboard(model: KnowledgeModel): DashboardModel {
    const total = model.size();
    const percent = (count: number): number => (total > 0 ? Math.round((count / total) * 100) : 0);

    let connected = 0;
    let orphaned = 0;
    let unresolved = 0;
    for (const idea of model.all()) {
        if (idea.maturitySignals.degree >= 1) connected++;
        else orphaned++;
        if (idea.relations.some((relation) => model.get(relation.to) === undefined)) unresolved++;
    }
    const connectivity: DashboardPanel = {
        key: "connectivity",
        metrics: [
            { key: "connected", count: connected, percent: percent(connected) },
            { key: "orphaned", count: orphaned, percent: percent(orphaned) },
            { key: "unresolved", count: unresolved, percent: percent(unresolved) },
        ],
        recommendation:
            orphaned > 0 ? { token: "connect-orphans", count: orphaned } : { token: "all-connected", count: 0 },
    };

    const debt = computeKnowledgeDebt(model);
    const hasDebt = debt.categories.some((category) => category.count > 0);
    const debtPanel: DashboardPanel = {
        key: "debt",
        metrics: [{ key: "score", count: debt.score, band: severityBucket(debt.score) }],
        recommendation: hasDebt ? { token: "reduce-debt", count: debt.score } : { token: "debt-clear", count: 0 },
    };

    const process = byState(model, "fleeting").length;
    const contradictions = edgesByType(model, "contradicts").length;
    const connections = findDiscoveries(model).length;
    const questions = openQuestions(model).length;
    const today: DashboardPanel = {
        key: "today",
        metrics: [
            { key: "process", count: process },
            { key: "contradictions", count: contradictions },
            { key: "connections", count: connections },
            { key: "questions", count: questions },
        ],
        recommendation: todayRecommendation(contradictions, questions, process, connections),
    };

    return { panels: [connectivity, debtPanel, today] };
}
