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
| `classifyHealth` | `HealthResult` | Health (orphans / dead-ends, over the model's edges) |
| `deriveRecommendations` | `KnowledgeRecommendation[]` | Home / Health / Discovery (via #268) |
| `deriveFacets` | `Facet[]` | Explore (#482) |

### Facets: what your vault lets you ask (#482)

`deriveFacets(model, selection)` answers a question the interface never used to ask its own
model: *which values do you actually use?* It returns the lifecycle states, relation types (in
both directions), top-level folders and structural shapes present in the **current selection**,
each with a count and with the query term it contributes.

One rule governs what is offered:

> A value appears only when `0 < count < selection.length`.

Nothing that matches nothing; nothing that matches everything. Neither can narrow, and a filter
that cannot narrow is noise. Two consequences follow, and both are load-bearing:

- once a selection is entirely `permanent`, the state group **disappears** instead of offering
  you the thing you already did;
- **clicking can never empty your results.** Because counts are conditional on the selection,
  every offered term finds something — asserted exhaustively, every term, one at a time. The
  empty answer stops being somewhere the interface can walk you into.

Age is deliberately not a facet: `older-than:` is a dial, not a list of values, and it stays a
typed term. The cost is `O(N + E)` — 69 ms over 50,000 notes, which matters because the facets
are re-derived after **every** click.

## Computed once per revision (#458)

`KnowledgeModel.revision()` has existed since #302 and, until 3.6, **nothing consumed it**. Every
surface called `getModel()` and recomputed its projection from scratch, whether or not a note had
changed — and the `resolved` event fires far more often than the graph actually moves.

The [budgets](../development/performance-budgets.md) said how much that cost, and the answer was
lopsided: most projections are milliseconds, and **discovery is 1.5 seconds over ten thousand
notes** — a hundred times heavier than any other.

So three projections are wrapped in `memoise` (`architecture/knowledge/model/memo.ts`):
`findDiscoveries`, `computeKnowledgeDebt` and `buildKnowledgeMap`. Measured: a second render of an
unchanged 10k model went from **1,413 ms to 0.073 ms**.

The wrapper is applied **at each definition**, not at the State barrel, because Home and the
dashboard deep-import these functions — a barrel-only wrapper would have missed the heaviest
callers.

### The rules that make it safe

- **Per model instance, one revision at a time.** Keyed on the model itself (a `WeakMap`), not on
  the revision number alone — two freshly built models both sit at revision 1, and answering one
  with the other's result is the worst kind of cache bug. (The existing suite caught exactly that
  during the change.) When a model moves, everything derived from its previous revision is dropped:
  there is no partial staleness to reason about.
- **Keyed by the arguments too.** `findDiscoveries(model, { limit: 1 })` and `{ limit: 2 }` are two
  questions, not one.
- **An argument that cannot be serialised is not cached at all** — computing twice is cheap,
  answering the wrong question is not.
- **Bounded** (64 entries per model, least-recently-used eviction), and the `WeakMap` lets a
  discarded model take its cache with it.
- **A failure is not an answer**: a projection that threw is re-run next time.

### What may be memoised

Only a **pure function of the model and its arguments**. A projection that reads the clock, the
settings or the vault cannot be keyed on the model's revision, because the key would not change
when the answer does. A guardrail test
(`test/architecture/knowledge/memoisedProjections.test.ts`) scans the three wrapped files for
`Date.now`, `new Date`, `Math.random` and any Obsidian access, and fails if one appears.

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

## Health derives from the model (#274)

`classifyHealth(model)` classifies each idea over the **model's typed edges** — an **orphan** has no
outgoing edge, a **dead-end** has no incoming edge (self-edges excluded). Because the model's edges
include semantic relations (`up::`, `supports`, inline `key:: [[X]]`) on top of raw wikilinks, a note
connected only semantically is no longer a false orphan/dead-end. This is an **intended number change**
vs the earlier raw-`resolvedLinks` classifier: counts drop for vaults that use relations, and are
identical for pure-wikilink vaults.
