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
| 1 | ~~**`versions.json` missing**~~ — present; maps `2.11.0→1.7.2`, `2.12.0→1.13.1` | — | repo root |
| 2 | ~~**`version-bump.mjs` missing**~~ — present; run by `npm version` | — | repo root |
| 3 | **Thin tests** — a jest + TDD harness is now seeded (3 pure-logic suites); breadth is still low | Limited regression safety net | whole repo |
| 4 | ~~**Obsidian-rule backlog** (was 475 problems)~~ — **cleared and blocking** (#85); AbstractInputSuggest migration done (#111); declarative settings API deferred (#112) | — | tooling |
| 5 | ~~**`innerHTML` usage (~8)**~~ — 0 remaining; enforced by the blocking Obsidian lint | — | — |
| 6 | **Widespread inline styles** (`el.style.*`) | `no-static-styles-assignment` violations | community/config modals |
| 7 | ~~**`log.error` silenced when logging off**~~ — errors always surface (wired in the constructor) | — | `Logger.ts` |
| 8 | **`onunload` doesn't call `unloadComponents()`** | Component teardown skipped | `main.ts` |
| 9 | **Canvas monkey-patching** of internal APIs | Fragile across Obsidian updates; manual-review flag | `canvas/CanvasPatcher` |
| 10 | **Backend has no auth/CORS/health, dev-only posture** | Not production-ready | `backend/` |
| 11 | **`es.ts` locale behind `en.ts`** | Missing Spanish strings fall back to English | `architecture/lang/locale` |

See [Obsidian review & scoring](obsidian-review-and-scoring.md) for how #1–#6 map to the score.

## Revival roadmap

Ordered by leverage. Each item is small enough to be a focused PR.

### Milestone 1 — Release & submission compliance (unblocks everything)

- [x] Restore `version-bump.mjs`; generate and commit `versions.json` (`2.11.0→1.7.2`,
      `2.12.0→1.13.1`).
- [x] Add `eslint-plugin-obsidianmd` + `eslint.config.mjs` + `npm run lint:obsidian`; run it in
      CI. **Done (#85):** the 475-problem backlog is burned down to zero and the check is now
      blocking (part of `npm run verify`, the pre-push hook and CI). Two larger best-practice
      migrations are deferred with per-file rule relaxations: AbstractInputSuggest (#111) and the
      declarative settings API (#112).
- [x] Fix the `innerHTML` occurrences and inline `el.style.*` assignments — 0 remaining,
      enforced by the blocking Obsidian lint.
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
