# Development journal (formerly the thinking heatmap)

!!! note "Shown in Practice"
    Since #645 the journal is drawn as the **Ideas developed** strip of
    **[Health › Practice](practice.md)** — the last 12 weeks, a cell per day. The separate *Momentum*
    mode and its 52-week grid (the old *Thinking heatmap*) were merged into Practice. *Show practice*
    (`show-thinking-heatmap`, id kept) opens it.

The **development journal** counts **ideas developed** per day — not a "notes created" volume chart.
It rewards *developing* ideas: advancing a note's state, adding a source, adding a connection.

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

PracticeRenderer (Health › Practice, #645) — the 12-week strip
  intensity is a --l0…--l4 CSS class (theme-aware), each cell aria-labelled with a tooltip
```

## What this is *not*

The heatmap counts **development events** — notes you connected, sourced, advanced. It is a history of
what you did.

It is deliberately **not** the same thing as the Cultivate/Home **streak**, which since
[#339](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/339) counts days you *exercised judgement*
(see [cognitive agency](cognitive-agency.md)). The streak is the momentum signal, so it had to stop
rewarding mere activity; the heatmap is a record, and rewriting it would have discarded a year of real
data to add no insight. Two questions, two answers, both stated plainly.
