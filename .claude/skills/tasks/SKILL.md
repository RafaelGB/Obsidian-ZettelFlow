---
name: tasks
description: Stage 3 of the SDD pipeline — turn a ZettelFlow plan (in a GitHub issue comment) into an ordered TDD task checklist posted as a second issue comment. Each task has the failing test to write first and the guardrail that proves it. Use after a plan comment exists and the user says "break this into tasks", "make the task list", or "tasks for issue #N". Delegate to the implementation-planner agent.
---

# /tasks — break the plan into a TDD checklist (issue comment)

Stage 3 of the [SDD pipeline](../sdd/SKILL.md). Given a plan comment on a GitHub issue, post a
second comment with an **ordered, dependency-aware** task checklist — each task is one
red→green→refactor cycle and, ideally, one commit that leaves `npm run verify` green.

**No local files** — the task list lives in the GitHub issue as a comment.

## Owner

Delegate to the **`implementation-planner`** agent (same agent as `/plan` — it already holds
context from reading the issue).

## Steps

The agent posts a comment containing a task checklist. For **each** task:

- `- [ ] **Tn**: <name>` — what gets done
- **Red** — the exact test file and what it asserts (cite the FR/AC it covers)
- **Green** — the minimal change to pass it
- **Guardrail** — always `npm run verify`; add `npm run lint:obsidian` (no new violations) for
  score work; `es.ts`/`en.ts` parity for i18n work
- **Commit** — the Conventional Commit line

Ends with a **Definition of done** block (all tasks checked, ACs met, quality audit + reviewer
clean, docs + `en`/`es` synced, issue listed in the PR's `Closes` set).

## Right-sizing

- A task should be completable and committable in one sitting; split if not.
- Pure-logic units (DTOs, flow traversal, utils) get real unit tests. React components / modals /
  Canvas patcher are integration territory — note how each is verified rather than pretending a
  unit test exists.

## Quality bar (the stage-3 gate)

Every task is test-first, small, and independently verifiable. Then run `/implement <issue #>`.
