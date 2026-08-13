# Evolution timeline

Obsidian's file history shows *text diffs* — what bytes changed. The **evolution timeline** shows how
an *idea* changed: the sequence of a note's lifecycle **state** and **claims** over time.

> 2024 "AI will replace programmers" → 2025 "not exactly" → 2026 "automates repetitive tasks" →
> 2027 "becomes a copilot"

## Opening it

Run **"Show evolution timeline"** from the command palette, or click **Open** next to *Evolution
timeline* in **Settings → ZettelFlow → Zettelkasten toolkit**. The pane follows the **active note**
and updates as you switch notes or edit.

## What is captured, and when

A **snapshot** is `{ date, state, claims }` — the note's lifecycle state and its claim texts at a
moment. Capture is **diff-gated** (the pure `recordSnapshot`): a new snapshot is recorded only on a
**meaningful change** — the `state` changed, **or** the claim-text set changed (order-insensitive) —
never on a keystroke that leaves the concept untouched. The first observation of a note records a
baseline.

Capture happens at the `KnowledgeIndex.upsert` choke point (every create/modify), the same point the
[thinking journal](thinking-heatmap.md) uses, so it catches claim edits that don't change state. A
bulk startup rebuild records nothing.

## Bounds and pruning

The store is bounded so it can't grow without limit:

- **Per note:** the last **20** snapshots (oldest dropped) — the pure `recordSnapshot` cap.
- **Total:** the **200** most-recently-evolved notes (`evictOldestNotes` drops the least-recently
  evolved) — the pure total-notes cap.
- **Pruned** when a note is deleted; **re-keyed** when a note is renamed.

## Privacy

Fully **offline** — no network, no AI. Unlike the thinking journal's path-free day→count tally, the
timeline necessarily stores **per-note lifecycle state, claim texts and timestamps**. Because it copies
note *content* into your vault's local plugin data (`data.json`, which people often sync or commit), it
is **off by default — opt in** under *Settings → ZettelFlow → Evolution timeline* (constitution §VII).
Once enabled the store lives **only** locally, is **bounded** (per-note 20, total 200), is **pruned on
delete** and **re-keyed on rename** (housekeeping runs even when the toggle is off), and turning the
toggle **off clears everything already captured**.

## Architecture

```
recordSnapshot(history, idea, now, { maxLen })   (pure, Obsidian-free, unit-tested)
  → Snapshot[]        diff-gated (state OR claim-set), bounded, immutable

evictOldestNotes(snapshots, maxNotes)            (pure, Obsidian-free, unit-tested)
  → snapshots         keep the most-recently-evolved notes

ConceptualTimeline (singleton, structural TimelineHost, mirrors DevelopmentJournal)
  KnowledgeIndex.upsert → capture(idea) · onDelete → prune · onRename → rekey
  capture gated on the opt-in toggle; prune/rekey run ungated (housekeeping); saves debounced

EvolutionTimelineView (ItemView) + EvolutionTimelineComponent (show-evolution-timeline, no hotkey)
  reads snapshotsFor(activeNotePath) → renders date · state · claims, oldest→newest; writes nothing
```
