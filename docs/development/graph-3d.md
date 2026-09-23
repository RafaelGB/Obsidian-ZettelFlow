# The graph lens

> Epic [#280](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/280), folded into
> [Explore](ask-your-graph.md) by [#484](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/484).
> A spatial, explorable force-directed graph — *see the shape of your thinking.*

The graph is a **lens on your Explore selection**, not a place of its own. Open **Explore** and
switch the lens to **Graph**: your whole vault is drawn, with the notes you selected **lit** and
everything else dimmed — the selection **in context**, which is the one thing a list structurally
cannot show you.

It had its own surface until 4.2. *Which notes match this?* and *what shape is my knowledge?* are
the same question, and answering them in two places meant you could narrow to twelve orphaned
permanents and then have no way to **see** them. Switching lens never recomputes the selection, and
never rebuilds the layout: a changed selection re-lights the graph in place.

Everything here is **read-only and offline** — clicking a node opens its note; the graph never
writes.

> See it in motion → the [Showcase](../showcase.md).

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

## Where the controls are (#542)

The window grew to **twenty-two controls** — sixteen in the top bar, six in a bottom bar — one
honest addition at a time, until nobody could find anything. It is now what Obsidian's own graph
does:

- **On the canvas**: the **search** box, **fit**, a **gear**, the status line and the legend. That
  is what you use *while looking*.
- **Behind the gear**, grouped by the question each answers: **see** (colour by, lite, fullscreen)
  · **lenses** (the seven, plus path mode) · **movement** (spread) · **time** (play, scrubber) ·
  **share** (image, clip, tour). It closes on the gear, on `Escape` and on a click in the canvas.
- **Gone**: the zoom buttons and slider. The wheel and pinch already do that, and three controls
  that duplicate a gesture are three controls (§XI).

Nothing else changed: every control kept its label, its handler and its active state. The active
lens is named in the status line, which is now the only always-visible sign of it.

## Discovery lens

Toolbar **chips** (with live counts) highlight an actionable class of note in space and dim the rest,
sourced from the model — click a chip to toggle it:

- **Orphans** — notes with no outgoing links.
- **Dead ends** — notes with no backlinks.
- **Contradictions** — both ends of any `contradicts` relation.
- **Alone** — notes with no link to anything else in your knowledge (#516).
- **Frontier** — notes whose neighbours are not all from their own neighbourhood (#525).
- **Bridges** — the **links** that cross from one neighbourhood into another (#526). The first lens
  about links rather than notes: both endpoints stay lit, so it reads as *what joins what*.
- **Gaps** — a faint **dashed line where a link is not** (#532): two notes that share context and
  were never linked, with both of them lit over the dimmed graph.

### The gap lens, and the two numbers it states

A gap is not in the graph, so this is a third **kind** of lens: it has no predicate, because there
is nothing in the data to match. What it draws comes from the gap projection
([morning discovery](morning-discovery.md)), bounded two ways — at most `GAP_DRAW_MAX` lines, the
strongest first, and only for pairs whose **both** notes are on screen. The status line states the
total and how many of them are drawn, because a bounded view that reports only what it drew tells
the flattering half of the truth.

`GAP_DRAW_MAX` is **30**, measured rather than felt. On the reference vault (94 notes, 100 real
links) 60 lines would be 60 % as many as the graph's real links — about 40 of them of score 1, the
weakest evidence there is — while at ten thousand notes the same 60 is 4 % and nearly invisible. 30
is 30 % and 2 %. A score floor is not the alternative: a floor of 2 keeps 20 of the reference
vault's 217 gaps and deletes the widest seam, whose 14 gaps are all score 1.

It is also the one chip that has **no count until you use it**. The other six fall out of a walk of
the graph the view already built; this one costs the shared gap pass — 982 ms over ten thousand
notes — and a view that spends a second rendering a number nobody asked for is what
[#458](../architecture/knowledge-state.md#computed-once-per-revision-458) exists to prevent. After
the first use it behaves like every other chip, including being disabled at `(0)`.

### The seam list, and flying to one

217 dashed lines is a picture of everything, which is a picture of nothing. So while the gap lens is
on, the legend's **neighbourhood list becomes a seam list**
([#533](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/533)): the widest
[seams](living-knowledge-map.md) first, each row carrying the two neighbourhoods' names with their
own palette swatches and the two numbers under them — *N gaps · M links*.

A row is framable exactly like a neighbourhood row: click it, or focus it and press Enter, and the
camera frames **both** neighbourhoods, so what you see is the two places and the space between them.
Click the framed row again and it pulls back to the whole graph. It is a camera move and nothing
else — no filter, no hidden node, no paint change.

Three details worth knowing:

- **`SEAM_LEGEND_MAX` is 8**, measured against the box rather than chosen: the legend holds roughly
  17 single-line rows before it scrolls, a seam row is two lines, and there are 24 seams on the
  reference vault (630 over a generated ten thousand notes). When the list is cut the heading says
  so — *Seams (8 of 24)* — rather than pretending eight is all of them.
- **It appears in the *Neighbourhoods* colour mode only.** A seam row's two swatches are the two
  neighbourhoods' colours; against state colours they would mean nothing. No toggle and no setting:
  the swap is a consequence of the lens you already turned on.
- **A seam with a side that is off screen is dropped**, the same rule the dashed lines follow. A row
  you cannot fly to would be a row that lies.

Framing keys on the **community**, not on its name. That was a defect until #533: the reference vault
has two different neighbourhoods both called `readme`, they merged into one legend row whose count
was the sum of both, and clicking it flew to both at once. A name is a label; a community is a place.

A ghost edge is a **scene object on the hull refresh cycle**, never a graph link. That is the
load-bearing part: `3d-force-graph` runs d3-force over the links it is given, so a candidate edge
added there would make the layout **pull the two notes together** — the graph would rearrange
itself around links that do not exist. Without `three`, the lens still lights both notes of every
gap; only the dashes are missing.

## Performance & reach

- The library (`3d-force-graph`, three.js) is **imported lazily** on first render and torn down on
  close, so it never sits in the plugin's startup path.
- `capGraph3D` and `GRAPH3D_MAX_NODES` (600) exist and are unit-tested, but **nothing calls them**:
  the view draws every indexed note. This page claimed the opposite until #532 went looking, and
  whether the cap should be applied or deleted is
  [#539](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/539) — with the measurement it needs
  and has never had.
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
- Pure ghost selection: `architecture/components/core/graph3d/graph3dGhosts.ts` (`selectGhosts`,
  `GAP_DRAW_MAX`, `ghostKey`) — which gaps fit on screen, decided without a scene (#532).
- Pure legend geometry: `architecture/components/core/graph3d/graph3dLegend.ts` (`neighbourhoodRows`,
  `seamRows`, `SEAM_LEGEND_MAX`, `legendShowsSeams`, `belongsToCommunity`, `belongsToSeam`, the
  framing keys) — what the legend lists and what a row flies to, decided without a DOM (#533).
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
