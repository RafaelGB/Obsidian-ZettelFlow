# Living knowledge map

The **living knowledge map** shows the *shape* of your slip-box: it detects your **hubs** — the notes
everything clusters around — and the notes that orbit each one. Unlike a hand-made map of content, it
**regenerates as the vault changes**, so it never goes stale.

## Opening it

Run **"Show knowledge map"** from the command palette, or click **Open** next to *Knowledge map* in
**Settings → ZettelFlow → Zettelkasten toolkit**. The pane updates automatically (debounced) whenever
notes or links change.

## How the map is built

The engine is **pure, graph-structural, read-only, and offline**:

- **Hubs** are the well-connected notes — degree ≥ 5 (the existing `hubs` query).
- **Every other note** is assigned to the hub it is most connected to — connection strength first
  (a two-way link beats a one-way one), then the hub's own degree, then path, all deterministic.
- Notes connected to no hub land in an **Unclustered** section.

Each cluster shows its hub, its member count, and the member notes; clicking any name opens the note.
It **writes nothing** — this is a *view* of the structure, distinct from the
[MOC builder](moc-builder.md) command, which generates MOC notes.

## Out of scope (for now)

Flat hub-clusters only — deep multi-level / community clustering, a configurable hub threshold, a
graph-canvas rendering, and a "build a MOC note from this cluster" action are possible follow-ups.

## Architecture

```
buildKnowledgeMap(model, { hubThreshold })   (pure, Obsidian-free, unit-tested)
  → { clusters: [{ hub, degree, members }], unclustered }

KnowledgeMapView (ItemView) + KnowledgeMapComponent (show-knowledge-map command, no hotkey)
  reads the KnowledgeIndex model → buildKnowledgeMap
  debounced metadataCache "resolved" + vault rename/delete listeners → recompute (auto-update)
  rows open notes via workspace.openLinkText
```
