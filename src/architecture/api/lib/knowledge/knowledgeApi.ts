import type { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import type { Judgement } from "architecture/knowledge/state";
import {
    buildKnowledgeDashboard,
    computeKnowledgeBalance,
    computeKnowledgeDebt,
    computeWeeklyReview,
    findDiscoveries,
    openQuestions,
    proposeAnswers,
    buildKnowledgeMap,
    conceptNeighbors,
    reasoningPaths,
    runGraphQuery,
    buildEvidenceMap,
    deriveOutline,
    cultivationQueue,
    readyToCultivate,
    classifyHealth,
    deriveRecommendations,
    judgementsFor,
    lastJudgementFor,
    agencySignals,
    unexaminedIdeas,
} from "architecture/knowledge/state";

/**
 * `zf.knowledge` (#350) — the **Knowledge State barrel, made callable from a user script**.
 *
 * ZettelFlow reads these projections to build its own surfaces; before this, a script could resolve a
 * folder and list files while the plugin next door answered *"which of my ideas grew without my
 * judgement?"*. Every member here is the barrel's own function with the live model (and, where
 * relevant, the judgement log) already bound — so a script calls `zf.knowledge.debt()`, not
 * `debt(model)`.
 *
 * **The anti-drift rule.** This module must not become a hand-written mirror of the barrel — that
 * mirror is exactly the bug epic #348 exists to kill. Every function the barrel exports is either
 * listed in {@link knowledgeApi} or named in {@link NOT_EXPOSED} with a reason, and a test fails the
 * build when a new one is neither. Forgetting to expose a projection is therefore impossible; choosing
 * not to expose one is fine, as long as the choice is written down.
 *
 * §XI: pure and Obsidian-free. The model and history arrive as accessors, so this is unit-testable
 * with no live vault, and it imports only from the State barrel — never a deep analysis path (#266).
 */

/** Live accessors, injected by the runtime binder so this module stays pure. */
export interface KnowledgeApiDeps {
    /** The current knowledge model. Throws if the index is not ready yet. */
    model(): KnowledgeModel;
    /** The recorded judgement log (empty when the record is disabled). */
    history(): readonly Judgement[];
    /** Whether the index has finished building. */
    ready(): boolean;
}

/** One exposed member: how to call it, and what it is. */
export interface KnowledgeMember {
    readonly signature: string;
    readonly summary: string;
    readonly call: (...args: never[]) => unknown;
}

/**
 * Barrel exports deliberately **not** on `zf.knowledge`, and why. Keeping the reasons here is what
 * makes the guardrail a decision point rather than a chore.
 */
export const NOT_EXPOSED: Record<string, string> = {
    // Internal helpers of a projection — the projection itself is what answers a question.
    classifyBucket: "internal helper of computeKnowledgeBalance",
    severityBucket: "internal helper of computeKnowledgeDebt",
    pairScore: "internal helper of findDiscoveries",
    toDayKey: "internal date helper",
    levelForCount: "internal heatmap helper",
    fromDashboardToken: "internal recommendation mapper",
    fromDebt: "internal recommendation mapper",
    fromBalance: "internal recommendation mapper",
    fromReview: "internal recommendation mapper",
    fromNextSession: "internal recommendation mapper",
    fromNextMove: "internal recommendation mapper",
    isJudgement: "type guard, not a projection",
    sanitizeJudgementLog: "persistence concern, owned by JudgementLog",
    recordJudgement: "a write; scripts read the model and write only their own note",
    recordDay: "a write into the journal counts",
    pruneCounts: "internal journal maintenance",
    developmentStreak: "momentum signal owned by the Home/Cultivate surfaces",
    buildHeatmapGrid: "view geometry, not knowledge",
    judgementDays: "feeds the streak; agencySignals answers the per-idea question",
    // View-shaped builders: they return layout for a specific ZettelFlow surface, not an answer.
    buildHome: "assembles the Home view model, not a question about the vault",
    build3DGraph: "renderer input for the 3D graph surface",
    graph3dStats: "3D graph view helper",
    graph3dSignature: "3D graph view helper",
    graph3dTimeRange: "3D graph view helper",
    graph3dUpToTime: "3D graph view helper",
    capGraph3D: "3D graph view helper",
    filterGraph3D: "3D graph view helper",
    buildAdjacency: "3D graph view helper",
    shortestPath: "operates on 3D graph adjacency, not the model",
    buildCultivationSession: "an interactive session with deliberate friction; not a pure answer",
    selectCultivationTarget: "internal to the cultivation session",
};

/** Build the `zf.knowledge` member table against live accessors. */
export function knowledgeApi(deps: KnowledgeApiDeps): Record<string, KnowledgeMember> {
    // `call` signatures below are the *user-facing* ones; KnowledgeMember types them loosely so the
    // table can hold projections of different arities without a union per entry.
    const model = () => deps.model();
    const history = () => deps.history();

    return {
        dashboard: {
            signature: "() => DashboardModel",
            summary: "The headline metrics of the whole vault.",
            call: () => buildKnowledgeDashboard(model()),
        },
        balance: {
            signature: "() => KnowledgeBalance",
            summary: "How the vault is composed across fleeting, literature and permanent ideas.",
            call: () => computeKnowledgeBalance(model()),
        },
        debt: {
            signature: "() => KnowledgeDebt",
            summary: "Ideas carrying structural debt — orphans, stubs, unsourced claims.",
            call: () => computeKnowledgeDebt(model()),
        },
        health: {
            signature: "() => HealthResult",
            summary: "Notes classified by slipbox health.",
            call: () => classifyHealth(model()),
        },
        review: {
            signature: "(now?: number, windowDays?: number) => WeeklyReview",
            summary: "What changed, stalled and matured over a recent window.",
            call: (now?: number, windowDays?: number) =>
                computeWeeklyReview(model(), now ?? Date.now(), windowDays),
        },
        discoveries: {
            signature: "(opts?: FindDiscoveriesOptions) => Discovery[]",
            summary: "Unlinked pairs of ideas that keep appearing together.",
            call: (opts?: Parameters<typeof findDiscoveries>[1]) => findDiscoveries(model(), opts),
        },
        openQuestions: {
            signature: "() => OpenQuestion[]",
            summary: "Questions recorded in the vault that nothing has answered yet.",
            call: () => openQuestions(model()),
        },
        proposeAnswers: {
            signature: "(path: string) => AnswerProposal[]",
            summary: "Existing notes that could answer an open question.",
            call: (path: string) => proposeAnswers(model(), path),
        },
        map: {
            signature: "(opts?: BuildKnowledgeMapOptions) => KnowledgeMap",
            summary: "Clusters and hubs of the idea graph.",
            call: (opts?: Parameters<typeof buildKnowledgeMap>[1]) => buildKnowledgeMap(model(), opts),
        },
        neighbors: {
            signature: "(path: string) => ConceptNeighbors",
            summary: "What sits next to one idea in the graph, by relation type.",
            call: (path: string) => conceptNeighbors(model(), path),
        },
        reasoningPaths: {
            signature: "(start: string, opts?: ReasoningPathsOptions) => Path[]",
            summary: "Chains of reasoning leading out of an idea.",
            call: (start: string, opts?: Parameters<typeof reasoningPaths>[2]) =>
                reasoningPaths(model(), start, opts),
        },
        query: {
            signature: "(source: string, now?: number) => GraphQueryResult",
            summary: "Run a graph query from a note against the model.",
            call: (source: string, now?: number) => runGraphQuery(model(), source, now),
        },
        evidence: {
            signature: "(path: string) => EvidenceMap",
            summary: "What supports and what contradicts one idea.",
            call: (path: string) => buildEvidenceMap(model(), path),
        },
        outline: {
            signature: "(selectedPaths: string[], opts?: DeriveOutlineOptions) => Outline",
            summary: "An outline derived from a set of notes.",
            call: (paths: string[], opts?: Parameters<typeof deriveOutline>[2]) =>
                deriveOutline(model(), paths, opts),
        },
        recommendations: {
            signature: "() => KnowledgeRecommendation[]",
            summary: "What to do next, ranked — the same list the Home surface shows.",
            call: () => deriveRecommendations(model(), history()),
        },
        cultivationQueue: {
            signature: "(exclude?: string[], limit?: number) => string[]",
            summary: "Ideas most worth thinking about next.",
            call: (exclude?: string[], limit?: number) =>
                cultivationQueue(model(), new Set(exclude ?? []), limit),
        },
        readyToCultivate: {
            signature: "() => number",
            summary: "How many ideas are ready to be worked on.",
            call: () => readyToCultivate(model()),
        },
        unexamined: {
            signature: "(opts?: { limit?: number }) => UnexaminedIdea[]",
            summary: "Ideas that gained structure but carry no judgement of yours.",
            call: (opts?: Parameters<typeof unexaminedIdeas>[2]) =>
                unexaminedIdeas(model(), history(), opts),
        },
        agency: {
            signature: "(path: string) => AgencySignals",
            summary: "Counts of the verdicts you have given on one idea. Never a score.",
            call: (path: string) => agencySignals(history(), path),
        },
        judgements: {
            signature: "(path: string) => Judgement[]",
            summary: "Every verdict you recorded about one idea.",
            call: (path: string) => judgementsFor(history(), path),
        },
        lastJudgement: {
            signature: "(path: string) => Judgement | null",
            summary: "The most recent verdict on one idea, or null.",
            call: (path: string) => lastJudgementFor(history(), path),
        },
    };
}
