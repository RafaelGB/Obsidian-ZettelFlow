---
name: tasks
description: Stage 3 of the SDD pipeline — turn a ZettelFlow plan.md into tasks.md, an ordered dependency-aware checklist of TDD-sized tasks (each with the failing test to write first and the guardrail that proves it). Use after a plan is approved and the user says "break this into tasks", "make the task list", or "tasks for spec N". Delegate to the implementation-planner agent.
---

# /tasks — break the plan into TDD tasks

Stage 3 of the [SDD pipeline](../../../specs/README.md). Given an approved `plan.md`, produce
`tasks.md` in the same folder: an **ordered, dependency-aware** checklist where each task is one
red→green→refactor cycle and, ideally, one commit that leaves `npm run verify` green.

## Owner

Delegate to the **`implementation-planner`** agent (same agent as `/plan` — it already holds the
context).

## Steps

1. Copy `specs/templates/tasks.md` → `specs/NNNN-slug/tasks.md`.
2. Decompose the plan into tasks. For **each** task write:
   - **Red** — the exact test file to add/extend and what it asserts (cite the `FR`/`AC` it
     covers). If the unit has no test yet, the first task is "write the failing test".
   - **Green** — the minimal change to pass it.
   - **Guardrail** — always `npm run verify`; add `npm run lint:obsidian` (no new violations) for
     score work, `es.ts`/`en.ts` parity for i18n work.
   - **Commit** — the Conventional Commit line (`fix(canvas): …`, `test(notes): …`).
3. Order by dependency; mark `depends on Tn` where relevant.
4. Fill the **Definition of done** (all tasks done, acceptance criteria met, quality audit +
   reviewer clean, docs + `en`/`es` synced, issue closed).

## Right-sizing

- A task should be completable and committable in one sitting; if it can't, split it.
- Pure-logic units (DTOs, flow traversal, utils) get real unit tests. React components / modals /
  the Canvas patcher are integration territory — the task notes how it's verified instead
  (manual smoke, guarded fallback) rather than pretending a unit test exists.

## Quality bar (the stage-3 gate)

Every task is test-first, small, and independently verifiable; the sequence has no gap between
"spec says" and "a task delivers it". Then run `/implement`.
