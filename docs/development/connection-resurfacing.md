# Connection resurfacing

Connection resurfacing ("talk to your slip-box") helps you **rediscover older, related notes**
worth revisiting. Given the note you have open, it surfaces a bounded, ranked shortlist — each with
a plain-language reason and one-click **open** and **insert link** — so the ideas you already wrote
keep re-entering the conversation instead of being buried.

It ships as **both** a command and a dedicated sidebar view, plus an on-demand **daily spark**.

## Opening it

- **Command** — run **"Resurface related notes"** from the command palette. It activates (or
  reveals) the sidebar view. Re-running reveals the existing leaf instead of opening a second one.
- **Settings** — click **Open** next to *Connection resurfacing* in
  **Settings → ZettelFlow → Zettelkasten toolkit**.
- **Sidebar view** — titled **"Resurface"** (`sparkles` icon). Once open it refreshes on its own as
  you move between notes.

## View states

| State | When shown |
|---|---|
| No active note | No markdown note is focused — open one to get suggestions. |
| Finding related notes | A recompute is in progress (transient). |
| Ready | Related notes were found — a ranked, clickable list with reasons. |
| No relations | A note is open but nothing relates to it yet — an encouraging nudge to link it. |
| Daily spark | The daily-spark button was pressed — a serendipity list (see below). |
| Error | Ranking failed — `log.error` fires; use the refresh button to retry. |

## Ranking signals

Ranking runs entirely over the already-indexed metadata (`getAllTags` + `resolvedLinks`); no file
content is read. The pure logic lives in `resurfaceRanking.ts` and is unit-tested.

- **Shared tags** — the strongest signal (weight 3 per shared tag).
- **Links** (weight 2 each):
  - the active note **links to** a candidate,
  - a candidate **links to** the active note (a backlink),
  - both notes link to the **same third notes** (shared link targets).
- **Recency bias** — a deliberately *small* tie-breaker (bounded below 1, so it can never outweigh
  real tag/link overlap) that nudges notes you have **not touched in a while** higher. Age is
  measured from the file's modification time.

A candidate must share **at least one tag or link** to appear — recency alone never surfaces an
unrelated note in the ranked list. The active note itself is always excluded. Results are sorted by
score (desc), then oldest-first, then note name, and bounded to the top few.

## Daily spark

The **"Daily spark"** button is a separate, serendipity surface. It ignores relatedness entirely and
simply lists the notes you have **least recently touched** (oldest first). It is deterministic given
the vault state, so pressing it twice in a row shows the same picks.

## Actions on each row

- **Click a note name** or the **Open** button — opens the note in the workspace.
- **Insert link** — inserts a `[[Note name]]` wikilink into the active editor at the cursor. If no
  markdown editor is focused, the action is a safe no-op.

## Auto-refresh

The view subscribes to the workspace `active-leaf-change` and `file-open` events. A burst of
active-note changes is **throttled** (400 ms) so at most one recompute fires. Editing a note's body
is intentionally **not** a trigger. Each recompute emits a `log.debug` line with the candidate count
and duration.

## Architecture

```
ResurfaceView (ItemView)
  registers throttled active-leaf-change / file-open listeners
  recompute() → build ActiveNoteSignals + ResurfaceCandidate[] → rankResurfacedNotes()
  showDailySpark() → pickDailySpark()
  render() → 6 UI states (createEl/empty, c() classes, t() i18n)

resurfaceRanking.ts (pure, no Obsidian imports, unit-tested)
  rankResurfacedNotes(): tag/link overlap + bounded recency bias
  pickDailySpark(): oldest-first serendipity picks

ResurfaceComponent (PluginComponent)
  registers "resurface-related-notes" command (no default hotkey)
  activates or reveals the leaf
```
