# Morning discovery

**Morning discovery** surfaces up to **three surprising connections** — pairs of notes that
share concepts but aren't linked yet — each one click from being related. The value of a slip-box
shows up in *unexpected* links, not the backlinks you already knew about.

## Where you see it

On **[Home](zettelflow-home.md)**, in its own section. Running **"Show discoveries"** from the command
palette still works and opens Home — since [#504](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/504)
the Discovery surface is gone, because Home already rendered these pairs from the same function and a
door onto something that lives elsewhere is not a surface.

Each row is one pair, and either name opens its note. Linking them is an act you perform in the note
(or through Cultivate's *connect*), never something a surface does for you
([constitution §XII](constitution.md)).

## How pairs are found

The engine is **graph-structural, offline, and read-only** — the same heuristic as
[find related](../actions/FindRelated.md) (#154), applied to *pairs*:

`score(a, b) = 2·|notes linking to both| + 1·|notes both link to|` — co-citation weighted above
bibliographic coupling. Only pairs that share context score above zero, **already-linked pairs are
excluded** (either direction), and the top-scoring unlinked pairs are shown (canonical order, ties
broken by path). Candidate pairs are generated once per node (every pair among a note's neighbours),
so it stays efficient. No text similarity, no embeddings, no AI.

## Accepting, and saying no

**Accepting needs no memory.** Link the two notes and the pair stops being a gap by construction:
the engine excludes already-linked pairs in either direction, so once the model re-indexes it is
simply not there any more. The **`expands`** relation is the neutral "this note connects to that
idea" choice — there is no generic *related* type in the
[semantic vocabulary](../architecture/knowledge-model.md) (#147) — and every write goes through
`FrontmatterService` (deduplicated, add-only, never removes anything).

**Saying no is the half that needs recording**, and today nothing does: the same pairs come back for
ever. On a real vault the strongest gaps are often the vault's own scaffolding — folder index notes
co-cited by their parent — and no graph statistic separates a filing convention from a thought,
which is exactly the kind of call that belongs to a person and gets recorded as a verdict
([#534](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/534), epic
[#529](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/529)).

## Continuous discovery (#365, D5)

Discovery is not only a pane you open — it is **continuous**. The [Home](zettelflow-home.md) surface
registers vault listeners and, on **every** change (a note created, saved, renamed or deleted), re-runs
the same heuristic discovery and recommendation projections. So a connection that becomes possible the
moment you save a note is already waiting the next time you glance at Home — you never have to go looking.

Two invariants hold, and a guardrail test pins them:

- **Never AI.** The continuous path is `findDiscoveries` / `deriveRecommendations` / `buildHome` — pure,
  offline model queries. No completion is requested in the background; AI stays a deliberate, *foreground*
  Action ([#337](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/337),
  [constitution §XII](constitution.md)). A test asserts the whole Home path imports no AI provider and
  calls nothing that reaches one.
- **Never a silent write.** Continuous discovery only *proposes* — it surfaces connections and next
  moves; committing any of them stays the same judgement-gated act described above.

There is deliberately **no parallel background engine, no badge, and no on/off toggle**: continuous
discovery is a property of the Home surface refreshing, not a new feature bolted on (design by subtraction).

## Architecture

```
gapTally(model)                     (pure, Obsidian-free, memoised on the model alone)
  → every unlinked pair that shares context: a count, and a walk of them

topGaps(model, limit)               (a bounded linear selection over that walk, never a sort)
  → the strongest `limit` pairs, score desc then a asc then b asc

findDiscoveries(model, { limit })   (the same, bound to the default of three -- public on zf)

  read by: Home's section · the dashboard's count (the whole tally) · deriveRecommendations
  linking a pair → the create-semantic-relation action writes an `expands` relation
  open → workspace.openLinkText
```

One pass, several readers: `memoise` keys on a projection's arguments, so a reader wanting three
pairs and a reader wanting sixty would each have paid for the tally behind them. The tally takes no
arguments, which is what lets them share it — see
[one tally, many readers](../architecture/knowledge-state.md#one-tally-many-readers-530). At ten
thousand notes it holds over **1.2 million pairs**, so for the limits the product uses it is never
copied into an array and never sorted — measured A/B on one warm tally, 1,393 ms of sorting became
553 ms of selecting ([budgets](performance-budgets.md)).
