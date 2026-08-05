# Slip-box health dashboard

The slip-box health dashboard is a sidebar view that makes **link-debt visible** in a vault:
it surfaces **orphan notes** (no outgoing links) and **dead-end notes** (nothing links to them)
so authors can fix connectivity before the graph becomes fragmented.

## Opening the dashboard

Run the command **"Show slip-box health"** from the command palette. Re-running it reveals the
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
