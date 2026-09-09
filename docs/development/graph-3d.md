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
  inspired-by, question, example, implements), rendered **bold** with directional arrows and **flowing
  particles** so connections are the focus. A compact **legend** lists the relation types present.
- The most-connected **hub notes carry always-on labels** and a soft **glow**; other names **fade in
  as you zoom toward them** (and any node shows its name on hover).
- Each cluster sits inside a faint translucent **hull** so its grouping reads at a glance.
- Notes are **marked by kind** — `?` for open **questions**, `◆` for **sourced** notes — so types stand
  out (see the legend).
- An immersive **"Knowledge Galaxy" environment** (#384): a subtle **starfield** backdrop with a depth
  vignette, **cluster-hued glow halos** on hubs *and* other well-connected notes, and best-effort
  **selective bloom** so the graph reads as a living space, not a flat diagram. The environment is
  purely additive — it never blocks the base render, and a post-processing failure degrades to lit
  spheres rather than a blank canvas. It follows the **Lite** control and OS **reduced-motion**, and is
  absent on mobile / no-WebGL (which use the navigable-list fallback).
- Data comes purely from the offline `KnowledgeModel` via the Knowledge State surface
  (`build3DGraph`), so the WebGL view is a thin shell over tested data.

A persistent **status line** in the top bar always tells you what you're looking at — the active
colour mode, how many notes are shown, and any lens / pinned note / time-lapse in effect.

## Interacting

- **Orbit / pan** with the mouse; **hover** a node to preview its neighbourhood (its links and
  neighbours light up, everything else dims).
- **Click** a node to **pin** that neighbourhood (it stays focused and the camera flies to it);
  **double-click** to **open** the note; **click empty space** to clear the focus.
- **Search** (top bar) flies the camera to the first matching note.
- **Zoom** with the bottom-right control (− / slider / +) or the mouse wheel; **Fit view** re-frames
  the whole graph. Opening the mode **auto-fits** to show the entire graph.
- **Spread** (bottom bar) tightens or loosens the layout live, so you can pull clusters together until
  the connections read clearly.
- **Explore the active note in 3D** — a command that opens Graph → 3D and flies straight to the note
  you're in.
- **Relation filter** — click a relation in the legend to show/hide that kind of link.
- **Click a link** to open both of its notes (source here, target in a split).
- **Path mode** — toggle it, click two notes, and the **shortest path** between them lights up with the
  camera framing it.
- **Guided tour** (#385) — one click flies the camera on a **cinematic tour** through your hubs and
  most-recent notes (a deterministic, pure stop list). It is strictly optional and **any drag, wheel,
  click or key cancels it**; it honours `prefers-reduced-motion` (instant cuts, no drift), pauses when
  the tab is off-screen, and is not offered in the no-WebGL / mobile list fallback. This is a graph
  *showcase* flight, not an onboarding walkthrough.
- Updates are **incremental**: while the vault indexes, new notes join the graph and existing ones
  keep their positions — the layout never resets.

## Time-lapse

Press **Play** (bottom bar) to watch the graph **grow over time** — notes appear in creation order —
or drag the time slider to scrub to any point in your thinking history. Slide back to the end (or it
finishes) to show the whole graph again.

## Share your universe (export)

The **share** button (top bar) captures your graph so you can post it (#386):

- **Save image** — frames the whole graph (`zoomToFit`), forces a render (the WebGL buffer is cleared
  per frame), and captures a **PNG**.
- **Record time-lapse clip** — records the growth animation to a short **WebM** clip. Offered only when
  the device can record (feature-detected via `MediaRecorder`); WebM is the browser-native format —
  there is no bundled MP4/GIF encoder.

A small **accessible dialog** (keyboard-operable, ARIA-labelled) previews the capture and lets you edit
the file name; **Save to vault** writes it to your attachment folder through the **Vault API** (never
the Adapter, never a server). Export lives only on the WebGL top bar, so the mobile / no-WebGL fallback
shows nothing to export. The capture util (`components/core/export/`) is graph-agnostic and reused by
the evolution **idea card** (#387).

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
- The immersive **environment** (starfield, non-hub halos, selective bloom) is disabled under
  **Lite** mode and OS **reduced-motion**, and never runs on mobile / no-WebGL — Lite stays the
  guaranteed FPS escape hatch. Selective bloom loads lazily and best-effort; a failure never blanks
  the graph.

## Where it lives

- Pure projection: `architecture/knowledge/map/graph3d.ts` (`build3DGraph`, `filterGraph3D`,
  `capGraph3D`, `graph3dStats`, `buildAdjacency`, `OVERLAY_SPECS`, `STATE_COLOR_VARS`,
  `RELATION_COLOR_VARS`) — Obsidian-free, unit-tested.
- Pure environment math: `architecture/components/core/graph3d/graph3dEnvironment.ts`
  (`environmentEnabled`, `starfieldPositions`, `haloSpec`) — Obsidian-free, unit-tested (#384).
- View: `architecture/components/core/graph3d/Graph3DRenderer.ts`, mounted by `GraphSurfaceView` for
  the `3d` mode; the deep-link handoff is `graph3dFocus.ts`.
- Styles: `styles/components/graph3d.scss` — legend/toolbar colours share Obsidian's `--color-*`
  palette with the WebGL links so they never drift.

## Why three.js stays (a settled decision)

The 3D stack (`three` + `3d-force-graph` and friends) is **1,458 kB — 58.6%** of the plugin bundle,
measured with an esbuild metafile in [#340](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/340).
That number is known and accepted. **The graph is 3D, always** — there is no plan to swap it for a 2D
canvas renderer, and proposals to do so should be declined rather than re-measured:

- The Graph surface is **3D-only** since #280; the flat Map and Navigate views were deliberately retired
  into it. Dropping the renderer would remove one of the four surfaces, not a mode.
- Seeing the *shape* of your thinking in space is the visible payoff of the semantic graph. A flat
  diagram is what every other plugin already gives you.
- The weight costs nothing in the Obsidian review: the scan lists the dependency's base64 usage under
  **Disclosures**, not Warnings — it is
  [documented](capabilities-and-privacy.md), not penalised.

Bundle weight is a real cost, and it is paid on purpose.
