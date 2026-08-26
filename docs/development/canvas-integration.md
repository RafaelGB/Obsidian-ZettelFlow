# Canvas integration & robustness

ZettelFlow turns Obsidian's native Canvas into a workflow surface by **monkey-patching** a few
internal Canvas APIs (`src/architecture/plugin/canvas/extensions/CanvasPatcher.ts` via
`monkey-around`). Obsidian does not expose these as a public API, so they can change between app
versions. The integration is built to **degrade gracefully** rather than break the canvas (#304).

## What is patched

| Patch | Target | Purpose | If the internal changed |
|---|---|---|---|
| `popup-menu` | `canvas.menu.render` | fire the `canvas:popup-menu` event + re-center | skipped; menu still works |
| `view-data` | `CanvasView.getViewData` / `setViewData` | stable serialization + JSON repair + fire injection/render events | skipped; canvas save/load still works |
| (events) | — | the `zettelflow-*` events the extensions listen to | best-effort; a throw never corrupts a save |

## How it degrades (never a hard break)

1. **Patch-time (missing method).** `PatchHelper.patch` checks that every method it means to override
   exists; if one is gone it returns `null` instead of throwing, and the caller marks that patch
   **degraded** (`CanvasPatchStatus`).
2. **Run-time (a patched body throws).** Each patched body runs inside Obsidian's own loops, so its
   ZettelFlow additions are wrapped: on a throw it logs, marks the patch degraded, and **falls back
   to the original** method. The canvas keeps working without our enhancement.
3. **Report once.** The first degrade shows a single Notice ("canvas integration partially
   unavailable after an Obsidian update") — never a stack trace, never repeated spam.
4. **Self-check.** On load, a one-line summary is logged, e.g. `canvas patches: 2 attached, 0
   degraded`.

The status tracker (`CanvasPatchStatus`) is pure and unit-tested; `PatchHelper`'s fail-soft path is
tested too.

## Manual-check matrix (run after an Obsidian update)

Do this against the latest Obsidian when bumping `minAppVersion` or after an app update:

| Check | Expected |
|---|---|
| Open a ZettelFlow canvas | loads; no error Notice |
| Console on load | `ZettelFlow: canvas patches: N attached, 0 degraded` |
| Right-click a node / open the canvas popup menu | ZettelFlow options appear |
| Create a note through the wizard (drop-menu) | the node-connection drop menu appears and builds a note |
| Edit + save the canvas | saves; reopen shows the same graph (getViewData/setViewData intact) |
| Reopen an already-open canvas at startup | card-menu options + workflow styling are present (#234 re-apply) |

If any row fails, the console/self-check tells you **which** patch degraded; harden that specific
patch in `CanvasPatcher`. A degraded patch must never crash note creation.
