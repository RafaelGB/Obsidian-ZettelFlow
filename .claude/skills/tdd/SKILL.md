---
name: tdd
description: The test-driven development workflow for ZettelFlow — write a failing test first, run jest, use the Obsidian mock and the bare-specifier alias mappings, and know which code is unit-testable. Use when adding or changing plugin logic, fixing a bug, or when the user asks to "write a test", "do TDD", "add coverage", or works on any of the Obsidian-score issues.
---

# TDD workflow for ZettelFlow

Development here is **test-first**. The blocking guardrails are `typecheck` + `oxlint` + `jest`
(enforced by the `pre-push` husky hook and the CI workflow). The Obsidian guideline lint
(`lint:obsidian`) is advisory. Full rationale: `docs/development/testing-and-guardrails.md`.

## The loop (red → green → refactor)

1. **Red** — write a failing test in `test/`, mirroring the source path
   (`test/<area>/<Name>.test.ts`). Import from `@jest/globals`
   (`import { describe, it, expect } from "@jest/globals"`).
2. **Green** — implement the minimal change to make it pass.
3. **Refactor** — clean up while keeping the suite green.

Iterate with `npm run test:watch`; run `npm test` once; run `npm run verify`
(typecheck + oxlint + test) before committing.

## How tests are wired

- Tests live under `test/` (not `src/`), so the release `tsc` and esbuild never compile them.
- Import source through the **same bare aliases** as the app (`architecture/...`, `hooks/...`,
  `application/...`); jest resolves them via `moduleNameMapper` in `jest.config.js` (mirrors
  `tsconfig` `baseUrl: src`).
- The Obsidian runtime is stubbed by `test/__mocks__/obsidian.ts`. **Extend that mock** when the
  unit under test imports more of the Obsidian API (add the class/function you need).
- ts-jest compiles with `tsconfig.jest.json` (transpile-only via `isolatedModules`).

## What to test first (highest ROI, no Obsidian runtime)

- Pure helpers: `architecture/styles/helper.ts`, `hooks/utils/*` (already seeded).
- Note assembly: `application/notes/ContentDTO` & `NoteDTO` (zones, `{{key}}` substitution,
  tag de-dup) — may need a couple more mock stubs.
- Flow graph traversal: `architecture/plugin/canvas/Flows` (`FlowImpl.rootNodes/childrensOf`).
- Wizard transitions: the `noteBuilder` callbacks with fake flow/state.

## Harder (defer until needed)

- React components / modals → add `jest-environment-jsdom` + `@testing-library/react` and set
  `testEnvironment: "jsdom"` for those files.
- The canvas monkey-patcher against a real Canvas → integration territory, not unit tests.

## TDD for a bug fix (required for the score issues)

Reproduce the bug as a **failing regression test first**, then fix it. Every fix that closes an
Obsidian-score issue should land with the test that proves it.

## Commands

`npm test` · `npm run test:watch` · `npm run test:coverage` · `npm run typecheck` ·
`npm run lint` (oxlint) · `npm run lint:obsidian` (advisory) · `npm run verify`
