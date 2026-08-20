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

## A deferred unification (#268)

`classifyHealth` currently reads the **raw Obsidian link graph** (`resolvedLinks`, assembled by the
Health view and passed in), whereas the model's out-edges also include semantic relations. Unifying
health onto the model would change the displayed orphan/dead-end numbers, so it is deferred to the
Health view-collapse (#268). Phase 4 relocated `classifyHealth` into the State surface **verbatim**
(same inputs, same numbers) — see the `NOTE(#268)` header in
`architecture/knowledge/state/classifyHealth.ts`.
