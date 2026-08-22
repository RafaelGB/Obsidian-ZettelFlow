# 3D knowledge graph

> Epic [#280](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/280). A **3D** mode on the
> [Graph surface](../architecture/surfaces.md) that turns the flat map into a spatial, explorable
> force-directed graph — *see the shape of your thinking.*

Open the **Graph** surface and pick the **3D** mode (next to Map and Navigate). Everything is
**read-only and offline** — clicking a node opens its note; the graph never writes.

## What it shows

- **Nodes** are your notes, **sized by degree** (how connected they are). Colour has two modes,
  toggled in the toolbar:
    - **Maturity** (default) — by knowledge **state** on a ramp (fleeting → developing → permanent →
      evergreen). *This is the differentiator over a plain link graph: you see how mature your thinking
      is at a glance.*
    - **Cluster** — by the hub each note orbits (from the living knowledge map).
- **Links** are typed relations, **coloured by type** (plain link, supports, contradicts, expands,
  inspired-by, question, example, implements) with directional arrows and **flowing particles**. A
  compact **legend** lists the relation types present.
- Nodes and links **glow** (bloom) against a dark space — an immersive look, not a flat diagram.
- Data comes purely from the offline `KnowledgeModel` via the Knowledge State surface
  (`build3DGraph`), so the WebGL view is a thin shell over tested data.

## Interacting

- **Orbit / zoom / pan** with the mouse; **hover** a node to **focus its neighbourhood** (its links
  and neighbours light up, everything else dims); **click** a node to open it; **click empty space** to
  reset.
- **Search** (toolbar) flies the camera to the first matching note.
- **Fit view** re-frames the whole graph.
- **Explore the active note in 3D** — a command that opens Graph → 3D and flies straight to the note
  you're in.

## Discovery lens

Toolbar **chips** (with live counts) highlight an actionable class of note in space and dim the rest,
sourced from the model — click a chip to toggle it:

- **Orphans** — notes with no outgoing links.
- **Dead ends** — notes with no backlinks.
- **Contradictions** — both ends of any `contradicts` relation.

## Performance & reach

- The library (`3d-force-graph`, three.js) is **imported lazily** on first render and torn down on
  close, so it never sits in the plugin's startup path.
- Large vaults are **capped to the most-connected notes** (`GRAPH3D_MAX_NODES`, default 600) for a
  responsive layout; a hint notes when the view is capped.
- On **mobile** or when **WebGL is unavailable**, the mode degrades to a message with a button that
  opens the 2D **Map** instead of failing.

## Where it lives

- Pure projection: `architecture/knowledge/map/graph3d.ts` (`build3DGraph`, `filterGraph3D`,
  `capGraph3D`, `graph3dStats`, `buildAdjacency`, `OVERLAY_SPECS`, `STATE_COLOR_VARS`,
  `RELATION_COLOR_VARS`) — Obsidian-free, unit-tested.
- View: `architecture/components/core/graph3d/Graph3DRenderer.ts`, mounted by `GraphSurfaceView` for
  the `3d` mode; the deep-link handoff is `graph3dFocus.ts`.
- Styles: `styles/components/graph3d.scss` — legend/toolbar colours share Obsidian's `--color-*`
  palette with the WebGL links so they never drift.
