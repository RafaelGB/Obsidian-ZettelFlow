# The four surfaces

> Epic [#268](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/268) (Phase 7 of #262).

*Open ZettelFlow, not Obsidian.* The ~12 sidebar views that ZettelFlow grew were consolidated into
**four surfaces**, each hosting the former views as **modes** behind a segmented control. One front
door, everything reachable, nothing deleted.

## One ribbon button

Purpose-led work (#401) lives inside the existing **Home → Cultivate** mode. A small `inquiry`
activation intent selects start/resume/ordinary; private purpose text is never put into workspace view
state. The runtime singleton owns draft/checkpoint continuity across renderer remounts. No new surface
or command is registered; the ordinary mode keeps its recipe and friction settings.

There is a **single** all-in-one ribbon button ("Open ZettelFlow"). Its menu leads with **Create
note** (also the hotkey-bindable `Open workflow` command), then the system-adoption actions, then the
surfaces. Note creation is no longer its own ribbon icon.

## The surfaces and their modes

| Surface | Modes | Folds in (former views) |
|---|---|---|
| **Home** | Home · Cultivate · Recent | ZettelFlow Home (+ a **"What to do next"** recommendation surface, #273) + **[Cultivate](../development/cultivate.md)** (#309) + **[What ZettelFlow changed](reversibility.md)** (#454) |
| **Health** | Health · Timeline · Momentum | Slip-box health **+ the knowledge dashboard folded in** (#314) + Evolution timeline + Thinking heatmap |
| *(Discovery — dissolved, #504)* | — | its four modes answered two questions that already had homes: see below |
| **[Explore](../development/ask-your-graph.md)** | *(one mode, so no mode bar)* | Ask your graph + the retired **Graph** surface (#484), whose 3D view is now one of Explore's [lenses](../development/graph-3d.md) |

The count went **4 → 3 → 4 → 3**, and the honest reading is not "boxes were saved".

#484 absorbed the Graph surface: it hosted one mode, answering *what shape is my knowledge?* while
Explore answered *which notes match this?* — the same question in two places, with no way to carry
an answer across. That merge stands.

#487 then gave Explore its own room. Discovery's four modes are **narrow lists** — a handful of
pairs, a few resurfaced notes — which is why people keep that surface in a side panel. Explore is
facets, chips, an answer, a lens bar and a 3D graph, and a *mode* cannot be moved out of a pane
without dragging the four lists with it. The principle was never "fewer boxes": it is **one home
per capability, and no two places answering the same question**.

#504 then dissolved **Discovery**, whose four modes were never about discovery:

| Mode | What it really was | Where it went |
|---|---|---|
| Connections | `findDiscoveries`, a ranked pair-finder | Home — which **already rendered it**, from the same function |
| Questions | a global list of what is unanswered | Home |
| Forgotten | notes near *the active note* you have not revisited | the note's own view |
| Challenges | *the active note's* supports and contradictions | the note's own view |

Two were recommendations — *what should I do next*, which is what Home is for — and two were
about the note you had open, which is what the **This note** mode of Health already was. A
surface whose modes answer other surfaces' questions is a door onto four things that live
somewhere else.

A surface with a single mode draws **no mode bar** — a bar offering one choice is not a choice,
and an ARIA tablist of one is noise for a screen reader too.

Every mode reuses the retired view's rendering **verbatim** — same numbers, same behaviour — mounted
inside the surface as a `KnowledgeModeRenderer` (an Obsidian `Component`, so its listeners are cleaned
up on every mode switch).

## Open as tabs

Surfaces open as normal **main-area tabs** (`getLeaf('tab')`), not only in the right sidebar — so you
can move, split or pin them like any Obsidian document.

## No visible breakage (§XI)

- The **12 retired `show-*` opener commands** are kept as **aliases** that open the owning surface at
  the right mode (e.g. `show-slipbox-health` → Health/Health, `resurface-related-notes` →
  Discovery/Forgotten, `show-notes-history` → Home/Recent). Bind hotkeys to them as before.
- The **Graph surface's own view type** joined that alias list when it was retired (#484), so a
  workspace saved before the merge reopens Explore instead of an empty pane, and `show-graph` /
  `explore-in-3d` keep their ids and their hotkeys.
- A **mode that moved house** is handed over rather than dropped: `relocateMode` maps
  `zettelflow-discovery:ask` to the Explore surface (#487), so a workspace saved while Explore was
  still a Discovery mode reopens Explore — instead of quietly showing Connections, which is the
  failure that looks like nothing went wrong.
- A user's **saved or pinned leaf** of a retired view type is transparently redirected: a thin
  `LegacyRedirectView` transforms that leaf into the surface it now lives in, so no "no view of type
  X" pane ever appears.

## Where it lives

- Registry + back-compat maps (pure): `architecture/components/core/surface/{surfaceRegistry,legacyTargets}.ts`.
- Host + renderer contract: `architecture/components/core/surface/{ModeHostView,KnowledgeModeRenderer,LegacyRedirectView}.ts`.
- The three surfaces: `architecture/components/core/surface/{Home,Health,Explore}SurfaceView.ts`.
- Deep-linking to a mode: `activateSurface(app, surfaceType, mode)` in `architecture/plugin/services/ViewActivation.ts`.
