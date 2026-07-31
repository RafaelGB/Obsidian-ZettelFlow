# Spec: Harden the Canvas monkey-patcher

- **Issue:** #91
- **Status:** Done
- **Milestone / label:** obsidian-score / M3-robustness
- **Owner:** spec-author

## Problem

`architecture/plugin/canvas/extensions/CanvasPatcher.ts` monkey-patches **internal** Obsidian
Canvas APIs (`canvasView.canvas.menu`, `getViewData`/`setViewData`) via `monkey-around`. If those
internals change across an Obsidian update, the patch throws during load — `PatchHelper.patch()`
literally `throw`s when a target method is missing — which can break plugin initialization. There
is no graceful fallback and no user-facing signal.

## Value

Robustness across Obsidian updates and a cleaner manual review (the canvas patching is a known
manual-review flag). The plugin should keep working (minus the canvas hook) and tell the user,
instead of failing to load.

## Functional requirements

- **FR-1** — Every patched access guards the target's existence/shape before patching
  (`canvasView`, `canvasView.canvas`, `canvasView.canvas.menu`, the prototype methods).
- **FR-2** — `PatchHelper` never throws on a missing/changed target; it reports failure (returns
  null/false) so the caller can degrade.
- **FR-3** — On any patch failure, the plugin logs via `log` and shows a single user `Notice`
  explaining the canvas integration is unavailable; the rest of the plugin still loads.
- **FR-4** — Patches remain uninstalled on unload (already via `plugin.register`) and are verified
  against the current `minAppVersion` (1.7.2).
- **FR-5** — No bare `console.*` in the file (use `log`).

## Acceptance criteria

- **AC-1** — With a simulated missing internal (e.g. `canvas.menu` undefined / a patched method
  absent), `patch()` does not throw; it logs and shows a Notice, and `onload` completes.
- **AC-2** — `PatchHelper.patch()` returns null (not throw) when a required method is missing;
  callers handle null.
- **AC-3** — No `console.*` remains in `CanvasPatcher.ts`; Notice text is in `en.ts` + `es.ts`.
- **AC-4** — `npm run verify` green; `npm run lint:obsidian` not increased.

## Capability disclosure (constitution §VII)

- [x] None new — touches canvas integration internals only.

## Out of scope

- Fully typing the `any`-heavy patch signatures (that's the `no-unsafe-*` burn-down, #85).
- The separate `FlowImpl` async-forEach bug (tracked separately).

## Open questions

None.
