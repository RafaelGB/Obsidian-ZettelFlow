# Slip-box health dashboard

The slip-box health dashboard is a sidebar view that makes **link-debt visible** in a vault:
it surfaces **orphan notes** (no outgoing links) and **dead-end notes** (nothing links to them)
so authors can fix connectivity before the graph becomes fragmented.

## Opening the dashboard

Run the command **"Show slip-box health"** from the command palette, or click **Open** next to
*Slip-box health* in **Settings → ZettelFlow → Zettelkasten toolkit**. Re-running it reveals the
existing leaf instead of opening a second one.

## View states

| State | When shown |
|---|---|
| Indexing | The metadata cache is not yet resolved or a recompute is in progress. |
| Healthy | No orphans or dead-ends found — an encouraging, non-alarming message. |
| Results | Orphans and/or dead-ends found — summary counts + clickable note list. |
| Error | Classification failed — `log.error` fires; use the refresh button to retry. |

## Note classification

A single in-memory pass over `metadataCache.resolvedLinks` is performed per recompute:

- **Orphan** — the note has zero outgoing links (self-links excluded).
- **Dead-end** — no other note in the vault links to it.
- A note may be both.

No file content is read during classification; the scan uses only the already-indexed link graph.

## Actions

- **Click a note name** — opens the note in the workspace.
- **"Open note"** button — same as clicking the name; intended for one-handed keyboard-first use.
- **Refresh button** — triggers an on-demand recompute.

## Auto-refresh

The view subscribes to `metadataCache → "resolved"`, `vault → "rename"`, and `vault → "delete"`
events. Rapid changes are **debounced** (400 ms) so at most one recompute fires per burst.
Each recompute emits a `log.debug` line with duration, note count, orphan count, and dead-end
count.

## Knowledge debt (#159)

Below the orphan/dead-end sections the pane shows a **Knowledge Debt** read-out: a single **0–100
Debt Score** (0 = clean, higher = more debt) with a severity bar (low / medium / high) and a
per-category drill-down. It is a *byproduct* of the model your workflows already populate — not a
separate tracker.

**Categories** (each a fraction of the vault, weighted into the score):

| Category | Fires when | Weight | Fix |
|---|---|---|---|
| **Unreferenced** | nothing links to the note | 0.25 | connect it (find related / suggest link) |
| **Dangling** | the note links to nothing | 0.20 | connect it |
| **Unsourced** | the note makes a claim with no source | 0.30 | attach a source |
| **Open questions** | the note raises a `question` nothing `supports` | 0.25 | answer the question |

`score = round(100 · Σ weightᵢ · countᵢ / max(1, totalNotes))`, clamped to 0–100. Each drill-down
row is **one click from a fix** — it opens the offending note. The debt model
(`src/architecture/knowledge/debt/knowledgeDebt.ts`) is pure, Obsidian-free and unit-tested; it
reads the in-memory **Knowledge Model**, so it only sees *resolved* links — **broken-link** and
**duplicate** debt are deliberately deferred (the model does not ingest unresolved links).

## Knowledge balance (#161)

Below the debt section the pane shows **Knowledge balance** — what your slip-box is *made of*. Every
note is classified into exactly one composition bucket (**evidence-first** cascade) and shown as a
count + percent:

| Bucket | A note lands here when… |
|---|---|
| **References** | it carries a source (`hasSources`) — checked first, so a sourced note is a reference regardless of what else it does |
| **Questions** | else it has an outgoing `question` relation |
| **Examples** | else it has an outgoing `example` relation |
| **Conclusions** | else it has an outgoing `supports` or `implements` relation |
| **Concepts** | otherwise (the default) |

Because buckets are mutually exclusive the percentages partition the vault (they sum to ~100%, give
or take integer rounding). When the vault has at least `MIN_NOTES_FOR_SUGGESTIONS = 5` notes, a
balance nudge fires for any under-represented bucket (exact, un-rounded ratio): references < 15 %,
examples < 10 %, questions < 5 %. A balanced slip-box shows a single "well-balanced" line. The model
(`src/architecture/knowledge/balance/knowledgeBalance.ts`) is pure, Obsidian-free and unit-tested;
classification is from model signals only (no note-body NLP).

## Architecture

```
SlipboxHealthView (ItemView)
  registers debounced vault/cache listeners
  recompute() → classifyHealth(LinkGraph) → HealthResult
  render() → 4 UI states (createEl/empty, c() classes, t() i18n)

classifyHealth.ts (pure, no Obsidian imports, unit-tested)
  builds backlink index from resolvedLinks in a single pass
  returns { orphans, deadEnds, totalScanned, durationMs }

SlipboxHealthViewComponent (PluginComponent)
  registers "show-slipbox-health" command (no default hotkey)
  activates or reveals the leaf
```
