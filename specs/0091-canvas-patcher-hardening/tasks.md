# Tasks: Harden the Canvas monkey-patcher

- **Plan:** [plan.md](plan.md)

## Tasks

- [x] **T1 — PatchHelper fail-soft** (FR-2/AC-2)
  - Red: `test/architecture/plugin/canvas/PatchHelper.test.ts` — required method missing → `patch()`
    returns null and does not throw; present → returns object and registers an uninstaller.
  - Green: replace the `throw` with a guarded `return null`; guard `target`/`constructor.prototype`
    in the prototype/instance helpers; return boolean where they were `void`.
  - Guardrail: `npm run verify`.

- [x] **T2 — CanvasPatcher guards + Notice** (FR-1/FR-3/FR-5)
  - Green: guard `canvasView?.canvas?.menu`; check patch results; wrap `patch()` in try/catch;
    `console.error` → `log.error`; show one i18n `Notice` on failure.
  - Guardrail: `npm run verify`; `lint:obsidian` not increased; no `console.*` in the file.

- [x] **T3 — i18n key** (FR-3/AC-3)
  - Green: add `canvas_patch_failed_notice` to `en.ts` + `es.ts` (sentence case).
  - Guardrail: en/es key parity.

## Definition of done

- [x] AC-1..AC-4 met; `verify` green; `lint:obsidian` 364 → 356 (−8); issue closed.
