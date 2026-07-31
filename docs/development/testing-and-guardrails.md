# Testing & guardrails

ZettelFlow development is **test-driven** and protected by layered, automated guardrails. This
page documents the setup and the policy. The AI harness mirrors it in the `tdd` skill
(`.claude/skills/tdd/`) and the CI workflow.

## Policy

- **Test-first.** New logic and bug fixes start with a failing test (a bug fix ships with the
  regression test that proves it).
- **Blocking guardrails:** `typecheck` (tsc) + `lint` (oxlint) + `test` (jest) must pass before
  code is pushed or merged.
- **Advisory guardrail:** the official Obsidian guideline lint (`lint:obsidian`) runs but does
  not block yet — the codebase has a known backlog of violations tracked as issues. It becomes
  blocking once that backlog is cleared.

## Where the guardrails run

| Layer | Runs | Checks |
|---|---|---|
| Local, on demand | `npm run verify` | typecheck + oxlint + jest |
| `pre-commit` (husky) | every `git commit` | `npm run lint` (oxlint) |
| `pre-push` (husky) | every `git push` | `npm run typecheck && npm test` |
| CI (`.github/workflows/ci.yml`) | every PR / feature push | typecheck + oxlint + jest (blocking); `lint:obsidian` (advisory) |

> Husky activates on `npm install` (via the `prepare` script). If hooks aren't firing, run
> `npm install` once to wire `core.hooksPath`.

## Test setup (jest + ts-jest)

- **Location:** tests live under `test/`, mirroring `src/` (e.g.
  `test/hooks/utils/PathUtils.test.ts`). Keeping them out of `src/` means the release `tsc` and
  esbuild never compile them.
- **Imports:** source is imported through the same bare-specifier aliases used in the app
  (`architecture/...`, `hooks/...`). `jest.config.js` `moduleNameMapper` maps them to `src/`,
  mirroring `tsconfig`'s `baseUrl: "src"`.
- **Obsidian mock:** `test/__mocks__/obsidian.ts` stubs the Obsidian API (which is `external` at
  build time and has no runnable module). Extend it as units under test need more surface.
- **Compiler:** ts-jest uses `tsconfig.jest.json` (extends the base tsconfig, adds
  `isolatedModules` for fast transpile-only compilation).
- **Globals:** tests import `describe/it/expect` from `@jest/globals` (no ambient types needed).

Commands: `npm test`, `npm run test:watch`, `npm run test:coverage`.

### What to test first

Pure logic with no Obsidian runtime is the highest-ROI starting point and is already seeded:
`architecture/styles/helper.ts`, `hooks/utils/CompareUtils.ts`, `hooks/utils/PathUtils.ts`.
Next: `ContentDTO`/`NoteDTO`, the flow graph traversal (`FlowImpl`), and the wizard callbacks.
React components and modals need `jsdom` + `@testing-library/react` (add when required).

## Linters

- **oxlint** (`npm run lint`) — the fast, day-to-day linter over `src/`. **Blocking.**
- **eslint-plugin-obsidianmd** (`npm run lint:obsidian`) — the **official Obsidian guideline
  rules**, the same set behind the Community-hub automated review and the 1–100 quality score.
  Configured in `eslint.config.mjs`. **Advisory** for now.

### Current baseline

At the time this was set up, `npm run lint:obsidian` reported **475 problems (328 errors, 147
warnings)** across `src/`. That is the backlog to burn down to raise the score; it is tracked by
the M1/M2 issues. When it reaches zero (or an agreed threshold), flip the CI `lint:obsidian` step
from advisory (`continue-on-error: true`) to blocking. See
[Obsidian review & scoring](obsidian-review-and-scoring.md) for the rule catalogue and
[Project health & roadmap](project-health-and-roadmap.md) for the plan.

## Type-checking

`npm run typecheck` runs `tsc -noEmit -skipLibCheck` — the same gate the `release` script uses.
esbuild does the actual bundling; `tsc` only type-checks. **Blocking.**

## Adding coverage as you go

`npm run test:coverage` collects from `src/**`. There is no enforced threshold yet; add one in
`jest.config.js` (`coverageThreshold`) once coverage is meaningful, and make it a blocking CI
step. Treat each closed score issue as an opportunity to add the tests that lock in the fix.
