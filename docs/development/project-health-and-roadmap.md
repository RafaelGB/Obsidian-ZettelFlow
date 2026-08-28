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
| 3 | **Thin tests on the write paths** — pure-logic breadth is now high (~189 suites); the vault-mutating paths are the remaining gap, addressed by **epic #317 (E2, the safety net)** | Limited regression safety net on writes | whole repo |
| 4 | ~~**Obsidian-rule backlog** (was 475 problems)~~ — **cleared and blocking, zero relaxations** (#85, #111, #112) | — | tooling |
| 5 | ~~**`innerHTML` usage (~8)**~~ — 0 remaining; enforced by the blocking Obsidian lint | — | — |
| 6 | ~~**Widespread inline styles** (`el.style.*`)~~ — 0 remaining, enforced by the blocking Obsidian lint | — | — |
| 7 | ~~**`log.error` silenced when logging off**~~ — errors always surface (wired in the constructor) | — | `Logger.ts` |
| 8 | ~~**`onunload` doesn't call `unloadComponents()`**~~ — `main.onunload` tears down components + flushes journal/timeline + unregisters actions (verified by a test, #316) | — | `main.ts` |
| 9 | **Canvas monkey-patching** of internal APIs — now **guarded** (#304): fails soft on missing methods, catches runtime throws and falls back to the original, reports once + a self-check log | Fragile across Obsidian updates, but no longer a hard break | `canvas/CanvasPatcher`, `canvas/…/CanvasPatchStatus` |
| 10 | ~~**Backend has no auth/CORS/health, dev-only posture**~~ — backend removed (#294); the community gallery is fully static | — | — |
| 11 | ~~**`es.ts` locale behind `en.ts`**~~ — full parity, enforced by a fail-on-drift test (`localeParity.test.ts`, #316) | — | `architecture/lang/locale` |

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
- [x] Verify `releases.yml` attaches `main.js` / `manifest.json` / `styles.css` under a tag equal
      to `manifest.version` (#316): modernized to `gh release create` + a step that **fails the
      release if the tag ≠ `manifest.version`**.

### Milestone 2 — Quality & safety net

- [x] Add a `jest.config` (ts-jest) + TDD harness, seeded with pure-logic suites. **Next:** grow
      coverage — `ContentDTO` / `NoteDTO`, the flow graph traversal (`FlowImpl`), wizard callbacks.
- [x] Migrate inline styles to CSS classes in `src/styles/components/` — 0 remaining (blocking lint).
- [x] Always allow `log.error`; keep `debug`/`trace` gated (wired in the Logger constructor).
- [x] Call `ZComponentsManager.unloadComponents()` from `onunload` (#316; test-verified).

### Milestone 3 — Robustness

- [x] Harden the canvas patcher: guard every patched method, assert the target shape, graceful
      fallback + a single Notice + a self-check log (#304, `CanvasPatchStatus`).
- [x] Audit commands (ids/names), settings headings, and complete `es.ts` (#316): a command-id
      surface test (kebab-case, unique) + a whole-locale fail-on-drift test.

### Milestone 4 — Community gallery

- [x] **Backend removed (#294).** The community gallery is fully static (GitHub-backed); there is no
      FastAPI/MongoDB service to run or maintain. Contributions flow through GitHub (issue form + PR).

### Milestone 5 — Product "new life"

Ideas to explore (not committed scope):

- A first-run onboarding flow and a bundled example vault/flow.
- Capability **disclosures** ahead of Obsidian's disclosure labels (declare file-system access).
- More community content and a smoother install → use loop.

## How to use this document

Treat Milestone 1 as the definition of "ready to ship a compliant update." The
`obsidian-plugin-quality` harness skill re-runs the compliance audit on demand, and the
`obsidian-plugin-reviewer` agent reviews individual PRs against the guidelines.
