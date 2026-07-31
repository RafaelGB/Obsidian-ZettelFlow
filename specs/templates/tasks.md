# Tasks: <title>

- **Plan:** [plan.md](plan.md)
- **Owner:** implementation-planner → main assistant (implement)

> Stage 3 of the [SDD pipeline](../README.md). An ordered, dependency-aware checklist of
> **TDD-sized** tasks. Each task is small enough to be one red→green→refactor cycle and, ideally,
> one commit that leaves `npm run verify` green (constitution §II, §IX).

## Legend

- `[ ]` todo · `[~]` in progress · `[x]` done
- Each task names the **test to write first** and the **guardrail** that proves it.

## Tasks

- [ ] **T1 — <title>** (covers FR-_ / AC-_)
  - Red: write `test/<area>/<Name>.test.ts` asserting <…>.
  - Green: <the minimal change>.
  - Guardrail: `npm run verify` green; `npm run lint:obsidian` no new violations.
  - Commit: `<type>(<scope>): <subject>`

- [ ] **T2 — <title>** (depends on T1)
  - Red: …
  - Green: …
  - Guardrail: …
  - Commit: …

## Definition of done

- [ ] All tasks `[x]`.
- [ ] Every acceptance criterion in the [spec](spec.md) verified.
- [ ] `obsidian-plugin-quality` audit + `obsidian-plugin-reviewer` review clean.
- [ ] Docs + `en`/`es` synced. Issue closed.
