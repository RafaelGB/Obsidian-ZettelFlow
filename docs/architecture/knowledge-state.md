# Knowledge state (projections)

> Epic [#262](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/262) Phase 4 (#266).

**Knowledge State is a projection of the Knowledge Model, not a set of dashboards.** Every number a
user sees — debt, balance, discoveries, open questions, the heatmap, the evolution timeline — is
computed by a **pure function of the model**, and the Experience views (Home, Health, Discovery,
Graph) *consume* those projections rather than computing anything themselves.

*Metrics are consequences, not inventions* (the manifesto): a metric exists because a projection
derives it from the model, never because a view invented it inline.

## The State surface

All projections are exposed through one import surface — **`architecture/knowledge/state`** — so the
Experience layer has a single door to "what the model says", and no view reaches into an individual
analysis by a deep path. This is the §XI boundary made concrete: the surface is pure and
Obsidian-free (guarded by `test/architecture/knowledge/pure-is-obsidian-free.test.ts` over `state/`),
and a structural test (`test/architecture/components/core/experienceUsesStateSurface.test.ts`) enforces
that `components/core` only imports from `architecture/knowledge` or `architecture/knowledge/state`.

Every projection follows one contract:

```ts
export type StateProjection<Params extends unknown[] = [], Result = unknown> =
    (model: KnowledgeModel, ...params: Params) => Result;
```

## The projection inventory

| Projection | Result | Consumed by |
|---|---|---|
| `buildHome` | `HomeModel` | Home |
| `computeKnowledgeDebt` | `KnowledgeDebt` | Health |
| `computeKnowledgeBalance` | `KnowledgeBalance` | Health |
| `buildKnowledgeDashboard` | `DashboardModel` | Dashboard |
| `findDiscoveries` | `Discovery[]` | Discovery |
| `openQuestions` / `proposeAnswers` | `OpenQuestion[]` / answers | Open questions |
| `buildEvidenceMap` | `EvidenceMap` | Evidence map |
| `buildKnowledgeMap` | `KnowledgeMap` | Knowledge map |
| `conceptNeighbors` | `ConceptNeighbors` | Concept navigation |
| `computeWeeklyReview` | `WeeklyReview` | Review |
| `buildHeatmapGrid` | `HeatmapGrid` | Thinking heatmap |
| `deriveOutline` | `Outline` | Projects / synthesis |
| `classifyHealth` | `HealthResult` | Health (orphans / dead-ends) |
| `deriveRecommendations` | `KnowledgeRecommendation[]` | Home / Health / Discovery (via #268) |

## The recommendation pipeline — `Query → State → Recommendation → Command`

*Every metric proposes an action* (the manifesto). The last leg of the pipeline is one primitive,
`KnowledgeRecommendation` (#267, `architecture/knowledge/state/recommendation.ts`):

```ts
interface KnowledgeRecommendation {
    reason: RecommendationReason;      // closed why-union (add-source, connect, resolve-contradiction, …)
    target: string[];                  // the note path(s) it concerns; empty = vault-wide
    command: CommandActionId | null;   // the kind:"command" action that resolves it, or null (no built-in yet)
    priority: number;                  // urgency in [0,1]
}
```

`deriveRecommendations(model)` is a **pure projection** (offline, deterministic, §XI obsidian-free)
that composes the debt / balance / discovery / question / state signals into one prioritized list.

**One primitive unifies six vocabularies.** Before #267 each surface invented its own "next-step"
tokens — dashboard `RecommendationToken`, debt `RemediationToken`, balance `BalanceSuggestion`,
review `ReviewAction`, home `NextSession.reason`, and the action-layer `NextMoveToken`. Pure
`from*` mappers collapse every one of their cases onto a single `RecommendationReason`, proven by a
coverage test — so the whole system speaks one recommendation language.

**`command` is a declarative pointer**, not an invocation: it names a `kind:"command"` action id
(Phase 3) — `add-source → attach-source`, `connect → create-semantic-relation` — or `null` when no
built-in command applies yet. Actually *running* a recommendation's command from a view (via the
#264 `KnowledgeContext`), and rendering recommendation widgets on Home/Health/Discovery, is deferred
to the view-collapse phase (#268). The dashboard keeps its current per-panel presentation unchanged;
Phase 5 delivers the primitive + the unification, not new displayed output.

## A deferred unification (#268)

`classifyHealth` currently reads the **raw Obsidian link graph** (`resolvedLinks`, assembled by the
Health view and passed in), whereas the model's out-edges also include semantic relations. Unifying
health onto the model would change the displayed orphan/dead-end numbers, so it is deferred to the
Health view-collapse (#268). Phase 4 relocated `classifyHealth` into the State surface **verbatim**
(same inputs, same numbers) — see the `NOTE(#268)` header in
`architecture/knowledge/state/classifyHealth.ts`.
