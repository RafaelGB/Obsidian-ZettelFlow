# Morning discovery

The **morning discovery** pane surfaces up to **three surprising connections** — pairs of notes that
share concepts but aren't linked yet — each one click from being related. The value of a slip-box
shows up in *unexpected* links, not the backlinks you already knew about.

## Opening it

Run **"Show discoveries"** from the command palette, or click **Open** next to *Discoveries* in
**Settings → ZettelFlow → Zettelkasten toolkit**. Each card shows a pair and asks *"these two notes
share concepts — link them?"* with three actions:

- **Link them** — writes the connection (see below).
- **Dismiss** — hides the pair for this session.
- **Open** — opens the first note.

## How pairs are found

The engine is **graph-structural, offline, and read-only** — the same heuristic as
[find related](../actions/FindRelated.md) (#154), applied to *pairs*:

`score(a, b) = 2·|notes linking to both| + 1·|notes both link to|` — co-citation weighted above
bibliographic coupling. Only pairs that share context score above zero, **already-linked pairs are
excluded** (either direction), and the top-scoring unlinked pairs are shown (canonical order, ties
broken by path). Candidate pairs are generated once per node (every pair among a note's neighbours),
so it stays efficient. No text similarity, no embeddings, no AI.

## Accepting (the one write)

**Link them** writes an **`expands`** relation from the first note to the second — appended to its
`expands` frontmatter key via Obsidian's `processFrontMatter` (deduplicated, add-only, never removes
anything). After the model re-indexes, the pair is linked, so it drops out of future discoveries.
There is no generic "related" type in the [semantic vocabulary](../architecture/knowledge-model.md)
(#147); `expands` is the neutral "this note connects to that idea" choice.

Dismissals are **session-only** — a dismissed pair may return next time you open the pane; an
accepted pair does not (it's now linked). A persisted dismissed-pair set is a possible follow-up.

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
  moves; committing any of them stays the same judgement-gated action the pane makes above.

There is deliberately **no parallel background engine, no badge, and no on/off toggle**: continuous
discovery is a property of the Home surface refreshing, not a new feature bolted on (design by subtraction).

## Architecture

```
findDiscoveries(model, { limit })   (pure, Obsidian-free, unit-tested)
  → top unlinked pairs by shared-context score

DiscoveriesView (ItemView) + DiscoveriesComponent (show-discoveries command, no hotkey)
  reads the KnowledgeIndex model → findDiscoveries
  accept → semanticRelationField("expands", …) shape written via fileManager.processFrontMatter
  dismiss → session Set · open → workspace.openLinkText
```
