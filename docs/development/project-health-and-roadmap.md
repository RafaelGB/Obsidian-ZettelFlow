# Project health & roadmap

A candid snapshot of ZettelFlow's technical debt and a plan to give it a new life. Audit date:
**2026-07-31** (plugin `v2.11.0`).

## Health snapshot

### 🟢 Strengths

- **Clear layering.** `main → starters → config → architecture → actions/application/hooks` with
  a consistent singleton pattern and a well-defined action contract.
- **Good Obsidian DOM hygiene in most places** — heavy use of `createEl`/`registerEvent`.
- **Centralized logging** (`Logger`) and **i18n** (en/es).
- **Deterministic canvas serialization** (`json-stable-stringify`) with lenient repair
  (`tiny-jsonc`).
- **CI/CD exists** — releases on tag, docs on push, Conventional Commits enforced.

### 🔴 Gaps & risks

| # | Issue | Impact | Where |
|---|---|---|---|
| 1 | **`versions.json` missing** | Breaks a compliant release; Obsidian can't map versions → `minAppVersion` | repo root (referenced by `npm version`) |
| 2 | **`version-bump.mjs` missing** | The `npm version` script fails | repo root |
| 3 | **Thin tests** — a jest + TDD harness is now seeded (3 pure-logic suites); breadth is still low | Limited regression safety net | whole repo |
| 4 | **Obsidian-rule backlog** — `eslint-plugin-obsidianmd` is now wired (advisory): **475 problems** to fix | Lower automated-review score until burned down | tooling |
| 5 | **`innerHTML` usage (~8)** | Security/guideline flag; lowers score | `VariableTextProcessors`, `*Settings`, autocompletion |
| 6 | **Widespread inline styles** (`el.style.*`) | `no-static-styles-assignment` violations | community/config modals |
| 7 | **`log.error` silenced when logging off** | Hard to diagnose user issues | `Logger.ts` |
| 8 | **`onunload` doesn't call `unloadComponents()`** | Component teardown skipped | `main.ts` |
| 9 | **Canvas monkey-patching** of internal APIs | Fragile across Obsidian updates; manual-review flag | `canvas/CanvasPatcher` |
| 10 | **Backend has no auth/CORS/health, dev-only posture** | Not production-ready | `backend/` |
| 11 | **`es.ts` locale behind `en.ts`** | Missing Spanish strings fall back to English | `architecture/lang/locale` |

See [Obsidian review & scoring](obsidian-review-and-scoring.md) for how #1–#6 map to the score.

## Revival roadmap

Ordered by leverage. Each item is small enough to be a focused PR.

### Milestone 1 — Release & submission compliance (unblocks everything)

- [ ] Restore `version-bump.mjs`; generate and commit `versions.json`.
- [x] Add `eslint-plugin-obsidianmd` + `eslint.config.mjs` + `npm run lint:obsidian`; run it in
      CI (advisory). **Next:** burn down the 475-problem backlog, then flip CI to blocking.
- [ ] Fix the `innerHTML` occurrences (`= "" → .empty()`; remove the HTML-string rewrite in
      `VariableTextProcessors`).
- [ ] Verify `releases.yml` attaches `main.js` / `manifest.json` / `styles.css` under a tag equal
      to `manifest.version`.

### Milestone 2 — Quality & safety net

- [x] Add a `jest.config` (ts-jest) + TDD harness, seeded with pure-logic suites. **Next:** grow
      coverage — `ContentDTO` / `NoteDTO`, the flow graph traversal (`FlowImpl`), wizard callbacks.
- [ ] Migrate inline styles to CSS classes in `src/styles/components/`.
- [ ] Always allow `log.error`; keep `debug`/`trace` gated.
- [ ] Call `ZComponentsManager.unloadComponents()` from `onunload`.

### Milestone 3 — Robustness

- [ ] Harden the canvas patcher: guard every patched method, assert the target shape, and add a
      graceful fallback + user Notice when Obsidian's Canvas internals change.
- [ ] Audit commands (ids/names), settings headings, and sentence-case all UI strings; complete
      `es.ts`.

### Milestone 4 — Backend productionization (only if the dynamic source is promoted)

- [ ] Add auth (validate the plugin `token`), CORS, and a `/health` route.
- [ ] Split docs deps out of `backend/requirements.txt`; drop `--reload` for prod.
- [ ] Enforce response models (replace `response_model=Dict`).
- [ ] Remove the vestigial empty `interfaces/api/routers/` package.

### Milestone 5 — Product "new life"

Ideas to explore (not committed scope):

- A first-run onboarding flow and a bundled example vault/flow.
- Capability **disclosures** ahead of Obsidian's disclosure labels (declare file-system access).
- More community content and a smoother install → use loop.

## How to use this document

Treat Milestone 1 as the definition of "ready to ship a compliant update." The
`obsidian-plugin-quality` harness skill re-runs the compliance audit on demand, and the
`obsidian-plugin-reviewer` agent reviews individual PRs against the guidelines.
