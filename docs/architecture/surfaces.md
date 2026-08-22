# The four surfaces

> Epic [#268](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/268) (Phase 7 of #262).

*Open ZettelFlow, not Obsidian.* The ~12 sidebar views that ZettelFlow grew were consolidated into
**four surfaces**, each hosting the former views as **modes** behind a segmented control. One front
door, everything reachable, nothing deleted.

## One ribbon button

There is a **single** all-in-one ribbon button ("Open ZettelFlow"). Its menu leads with **Create
note** (also the hotkey-bindable `Open workflow` command), then the system-adoption actions, then the
four surfaces. Note creation is no longer its own ribbon icon.

## The surfaces and their modes

| Surface | Modes | Folds in (former views) |
|---|---|---|
| **Home** | Home · Recent | ZettelFlow Home (+ a **"What to do next"** recommendation surface, #273) + Notes history |
| **Health** | Health · Dashboard · Timeline · Momentum | Slip-box health + Knowledge dashboard + Evolution timeline + Thinking heatmap |
| **Discovery** | Connections · Forgotten · Questions · Challenges | Discovery + Resurface + Open questions + Evidence map |
| **Graph** | Map · Navigate · 3D | Living knowledge map + Concept navigation + **[3D knowledge graph](../development/graph-3d.md)** (#280); *Reasoning* deferred |

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
- A user's **saved or pinned leaf** of a retired view type is transparently redirected: a thin
  `LegacyRedirectView` transforms that leaf into the surface it now lives in, so no "no view of type
  X" pane ever appears.

## Where it lives

- Registry + back-compat maps (pure): `architecture/components/core/surface/{surfaceRegistry,legacyTargets}.ts`.
- Host + renderer contract: `architecture/components/core/surface/{ModeHostView,KnowledgeModeRenderer,LegacyRedirectView}.ts`.
- The four surfaces: `architecture/components/core/surface/{Home,Health,Discovery,Graph}SurfaceView.ts`.
- Deep-linking to a mode: `activateSurface(app, surfaceType, mode)` in `architecture/plugin/services/ViewActivation.ts`.
