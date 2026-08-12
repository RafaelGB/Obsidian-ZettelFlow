# Thinking heatmap

The **thinking heatmap** is a GitHub-style calendar of **ideas developed** over the last 52 weeks —
momentum you actually care about, not a "notes created" volume chart. It rewards *developing* ideas:
advancing a note's state, adding a source, adding a connection.

## Opening it

Run **"Show thinking heatmap"** from the command palette, or click **Open** next to *Thinking
heatmap* in **Settings → ZettelFlow → Zettelkasten toolkit**. Each cell is one day, coloured by how
many development events happened, and is keyboard-focusable with a descriptive label ("N ideas
developed on YYYY-MM-DD").

## What counts as "development"

The journal records an event when — comparing a note before and after an edit — one of these
happens (creation itself does **not** count; momentum is about developing *existing* ideas):

| Event | Fires when |
|---|---|
| **State advanced** | the note's lifecycle state factor rose (e.g. fleeting → permanent) |
| **Source added** | the note gained its first source |
| **Connection added** | the note's outgoing links grew |

Events are detected at the knowledge-index's upsert choke point by diffing the note's model signals;
the initial vault scan is bypassed so first-load never floods the journal.

## The journal (local & private)

The data source is a **capped, per-day count map** stored in the plugin's `data.json`:
`{ "2026-08-12": 3, … }` — **day → count only**. It records **no note names, no content, and makes
no network request**. It is pruned to the last ~year, and persisted with a debounced save so a burst
of edits collapses to one write.

It is **on by default** (it only records benign aggregate counts); turn it off any time under
**Settings → ZettelFlow → Thinking journal**. See [Capabilities & privacy](capabilities-and-privacy.md).

## Architecture

```
detectDevelopmentEvents(before, after)   (pure, Obsidian-free, unit-tested)  → event types
buildHeatmapGrid(counts, now, weeks)     (pure, unit-tested)                  → 52×7 cells + levels
recordDay / pruneCounts                  (pure, unit-tested)                  → bounded tally update

DevelopmentJournal (runtime singleton, host injected at load)
  fed at KnowledgeIndex.upsert (best-effort, wrapped so it can never break indexing)
  reads/writes settings.journal.counts, debounced saveSettings

ThinkingHeatmapView (ItemView) + ThinkingHeatmapComponent (command, no hotkey)
  intensity is a --l0…--l4 CSS class (theme-aware), each cell aria-labelled + focusable
```
