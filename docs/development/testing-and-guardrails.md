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

## The coverage floor (#317, E2)

`npm run test:coverage` collects from `src/**` and enforces a **ratcheting coverage floor** set in
`jest.config.js` (`coverageThreshold.global`). CI runs `test:coverage`, so a regression that drops
coverage below the floor **fails the build**.

The policy — deliberately, not vanity:

- It is a **floor, not a target.** We chase *behavioral* tests of the risky, user-affecting paths
  (the write paths, the note-builder, the AI path), each with a named failure scenario — not a 100%
  number to game.
- **Raise the floor as tests land**, never lower it. The current values (stmts 83 / branch 75 /
  func 78 / lines 84) sit just below the measured level.

## Generated artefacts (#352)

Two files are **produced from the `zf` API manifest**, not written by hand:

| Artefact | Where |
|---|---|
| The API reference page | `docs/api/reference.md` |
| The script type declarations | written into the user's JS-library folder, on demand |

`generatedContract.test.ts` regenerates the reference from the manifest and asserts the committed file
matches, so code and docs cannot disagree without failing `npm run verify`. When you change a member's
signature or summary, regenerate rather than editing the page:

```bash
UPDATE_API_DOCS=1 npx jest generatedContract
```

The same suite hands the generated `.d.ts` to the **real TypeScript compiler** in strict mode. A
declaration that referenced a type it never declared would autocomplete happily and then show an error
in a file ZettelFlow wrote into the user's vault — so it is checked, not assumed.

## The write-path harness (#317, E2)

`test/support/harness.ts` (`wireHarness`) gives a test an **in-memory Obsidian** whose
`FileService` / `FrontmatterService` calls actually round-trip (one shared `frontmatter` object per
file, so a write is visible to a later read). Use it for any vault-mutating path — e.g. the Cultivate
writes, quick-capture, lifecycle transitions. The AI provider is tested with a settable
`requestUrl` (`__setRequestUrl` in the obsidian mock) so **no test makes a real network call**.

> **Import services by their file path** in tests (e.g. `architecture/plugin/services/FileService`),
> not the `architecture/plugin` barrel — the barrel is a jest mock and a cyclic import can surface a
> service as `undefined`.

Treat each closed score issue as an opportunity to add the tests that lock in the fix.
