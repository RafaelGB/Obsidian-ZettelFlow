# Concept navigation

**Concept navigation** lets you *walk* your vault the way you walk Wikipedia — but it's a wiki you
wrote. Pick a focus note and it shows the notes it connects to by **typed relation**, in **both
directions**; click any one to **re-focus** on it. Learning → Memory → Spacing effect → Anki, without
ever opening a folder.

It's the first tool of the 🕸️ **Graph** pillar, and it ships with a second, headless traversal —
**reasoning paths** — that reads the same typed-relations graph as an argument.

## Opening it

Run **"Show concept navigation"** from the command palette, or click **Open** next to *Concept
navigation* in **Settings → ZettelFlow → Zettelkasten toolkit**. The pane updates automatically
(debounced) whenever notes or links change.

## Navigating

- **Entry point.** With nothing focused, the pane seeds from the **active note** if it's indexed,
  otherwise it lists your **hubs** (the `hubs` query, degree ≥ 5) as starting points.
- **Focus.** The focused note's neighbours are grouped under **Leads to** (its outgoing typed
  relations) and **Referenced by** (the notes that point at it), each split by relation type
  (`supports`, `contradicts`, `expands`, `question`, `example`, `implements`, `link`).
- **Walk.** Click a neighbour to re-focus the pane on it — the hub→neighbour loop. Click the focus
  name to open the note in the editor; **Hubs** returns to the entry list.

The grouping engine `conceptNeighbors` is **pure, read-only, offline** and uses the **whole**
relation vocabulary — every typed neighbour is walkable, unlike reasoning paths below. It **writes
nothing**.

## Reasoning paths

`reasoningPaths(model, start, { maxDepth })` follows only the **argument-forward** relations —
`supports → expands → example → implements`, in that precedence — to return the **maximal argument
chains** leaving a note (an idea supported, expanded, exemplified, then implemented). It is
cycle-safe (never revisits a note on a path), depth-bounded (default 5 steps), deterministic, and
Obsidian-free. Counter-argument (`contradicts`), open `question`, `inspired-by` and plain `link`
edges are deliberately excluded so a path reads as a single line of reasoning — challenging an idea
is the job of [find contradiction](../actions/FindContradiction.md) and the
[thinking simulator](../actions/ThinkingSimulator.md). This function is a tested, documented
foundation; a dedicated argument-path view is a likely follow-up.

## Out of scope (for now)

Read-only navigation only — no graph-canvas rendering, no path pinning/bookmarking, no configurable
hub threshold or forward-relation set, and no argument-path rendering surface yet.

## Architecture

```
reasoningPaths(model, start, { maxDepth })        (pure, Obsidian-free, unit-tested)
  → [{ start, steps: [{ type, to }] }]            maximal, cycle-safe, forward-only

conceptNeighbors(model, path)                     (pure, Obsidian-free, unit-tested)
  → { focus, groups: [{ type, direction, targets }] }   out-before-in, vocabulary order

ConceptNavView (ItemView) + ConceptNavComponent (show-concept-nav command, no hotkey)
  reads the KnowledgeIndex model → conceptNeighbors(focus)
  entry = active indexed note else hubs()
  clicking a neighbour re-focuses; debounced metadataCache/vault listeners → recompute
```
