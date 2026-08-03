# Plan: Grow test coverage for note-assembly and flow-graph logic

- **Spec:** [spec.md](spec.md)
- **Status:** Approved
- **Owner:** implementation-planner

> Stage 2 of the [SDD pipeline](../README.md). This file is **HOW** we satisfy the spec. Every
> section is a gate the plan must clear before implementation starts.

## Approach

Pure TDD, tests-only. Follow the seeded suites' shape (import from `@jest/globals`, source via
bare-specifier aliases resolved by `jest.config.js` `moduleNameMapper`). Grow the two DTO suites
with edge cases, and add one new suite for `FlowImpl` that builds a small in-memory
`CanvasData` fixture (nodes + edges) — no real Obsidian runtime.

`FlowImpl` is reachable as pure logic **only** for its `text`/`group` branches. Its `file` branches
call `await FileService.getFile(...)` inside a fire-and-forget `forEach(async …)`, so their results
are pushed after the method returns (and would touch `ObsidianApi`, which the mock leaves
undefined). We therefore fixture only `text`/`group` nodes — the closest pure-logic seam — and
document the async bug rather than fixing it (tests-only spec).

The Obsidian mock needs `parseYaml`/`stringifyYaml` because `YamlService` (used by
`rootNodes`/`childrensOf` for text/group nodes) calls them. We add a minimal, typed, flat
`key: value` parser — enough for `isRoot()` and `getZettelFlowSettings()`.

## Files touched

By layer, so the blast radius is visible (see the architecture map in `CLAUDE.md`).

| File | Layer | Change |
|---|---|---|
| `test/application/notes/model/ContentDTO.test.ts` | test (application) | +7 cases: absent-key no-op, frontmatter merge/override, tag hoist accumulation, input mutation, falsy no-op, non-string-array rejection, intra-call de-dup. |
| `test/application/notes/model/NoteDTO.test.ts` | test (application) | +8 cases: falsy-setter guards, default path, no-trailing-slash, miss→undefined, empty-path ignore, `addFinalElement` set/undefined, `deletePos` cut semantics, fluent chain. |
| `test/architecture/plugin/canvas/Flows.test.ts` | test (architecture) | New suite (10 cases): `rootNodes` root-flag selection + edge independence + color population; `childrensOf` edge reachability, directionality, tooltip, link skip, group geometry. |
| `test/__mocks__/obsidian.ts` | test (mock) | Add minimal typed `parseYaml`/`stringifyYaml` (flat `key: value` subset). |

No `src/` production file is touched.

## Obsidian score impact (constitution §I)

No production code changes, so `npm run lint:obsidian` delta is **0** and the score is unaffected.
The blocking `jest` guardrail gains coverage, which protects the score during later refactors.

- Rule `<none>` — no `eslint-plugin-obsidianmd` surface touched (tests/mocks live under `test/`,
  which `oxlint ./src` and `tsconfig.json` (`include: src/**`) do not compile).

## Test strategy (constitution §II)

Test-first. Each unit gets failing assertions written before running jest.

- `test/application/notes/model/ContentDTO.test.ts` — FR-1 / AC-1, AC-2.
- `test/application/notes/model/NoteDTO.test.ts` — FR-2 / AC-3.
- `test/architecture/plugin/canvas/Flows.test.ts` — FR-3 / AC-4, AC-5.
- Obsidian-mock additions needed in `test/__mocks__/obsidian.ts`: `parseYaml`, `stringifyYaml`
  (minimal flat parser). FR-4.
- Fixtures are restricted to `text`/`group` nodes; `file` nodes are out of scope (need a vault).

## i18n impact (constitution §IV)

- New/changed keys in `architecture/lang/locale/en.ts` **and** `es.ts`: none.
- All UI text sentence case: n-a (no UI text).

## Docs impact (constitution §VIII)

- Page(s) to update: none required — `docs/development/testing-and-guardrails.md` already describes
  the harness and names these exact units as the next targets, so it stays accurate.
- `mkdocs.yml` nav change: no.

## Rollout & rollback

Ships with the normal build; tests are excluded from `dist/` (esbuild/`tsc` compile `src/` only).
Rollback is deleting the added test files and reverting the mock edit — no runtime impact.

## Risks

- The `FlowImpl` `forEach(async …)` pattern is order/timing sensitive; mitigated by fixturing only
  the synchronously-pushed `text`/`group` branches and never `file` nodes (which would also raise
  an unhandled rejection through the undefined `ObsidianApi`).
- The mock `parseYaml` is a deliberately narrow subset; it only needs to satisfy the flat configs
  the fixtures use. If future tests need nested YAML, extend it then.
