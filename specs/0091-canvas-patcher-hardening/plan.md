# Plan: Harden the Canvas monkey-patcher

- **Spec:** [spec.md](spec.md)
- **Status:** Approved
- **Owner:** implementation-planner

## Approach

Two layers of defence: (1) make `PatchHelper` **fail soft** — guard the target and return
null/false instead of throwing; (2) make `CanvasPatcher.patch()` **guard every internal access**
and wrap the whole routine in try/catch that logs and shows one user `Notice`. Notice text goes
through the i18n layer.

## Files touched

| File | Layer | Change |
|---|---|---|
| `src/architecture/plugin/canvas/extensions/utils/PatchHelper.ts` | architecture | `patch()` returns null instead of `throw` when a required method is missing; `patchObjectPrototype`/`patchObjectInstance` guard `target`/`constructor.prototype` and return boolean; never throw |
| `src/architecture/plugin/canvas/extensions/CanvasPatcher.ts` | architecture | try/catch around `patch()`; guard `canvasView?.canvas?.menu` and patch results; `console.error` → `log.error`; user `Notice` on failure |
| `src/architecture/lang/locale/en.ts` + `es.ts` | architecture (i18n) | new key `canvas_patch_failed_notice` (sentence case) |

## Obsidian score impact (constitution §I)

- Removes bare `console.*` (convention) — neutral-to-positive on lint. Does not add violations.
  Not attempting the file's `no-unsafe-*`/`no-explicit-any` backlog here (that's #85). Expected
  `lint:obsidian` delta: ≤ 0.

## Test strategy (constitution §II)

`CanvasPatcher` needs a real Canvas view → integration territory, not a jest unit. The
fail-soft logic in `PatchHelper.patch()` (missing required method → returns null, no throw) **is**
unit-testable with a plain fake object + a stub `plugin.register`. Add
`test/architecture/plugin/canvas/PatchHelper.test.ts`:
- required method present → patched, returns object, `register` called with an uninstaller.
- required method missing → returns null, does not throw, `register` not called.
Extend the obsidian mock only if needed (Plugin type is structural here).

## i18n impact (constitution §IV)

New key in both locales, sentence case:
- `en`: "ZettelFlow couldn't connect to the canvas. Canvas flows may be unavailable; the rest of the plugin works normally."
- `es`: Spanish equivalent.
(Depends on #92 landing first, since it rewrites the locale files.)

## Docs impact (constitution §VIII)

A line in `docs/development/obsidian-review-and-scoring.md` / architecture canvas page noting the
patcher now degrades gracefully. Optional; low priority.

## Rollout & rollback

Normal build. Rollback = revert; patches are additive and still uninstalled on unload.

## Risks

Touching the fragile patcher itself. Mitigation: behaviour-preserving guards only (same patches
when internals are present); the fail-soft path only triggers when something is already missing.
Order after #92 to avoid locale-file churn conflicts.
