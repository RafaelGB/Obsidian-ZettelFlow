---
name: plan
description: Stage 2 of the SDD pipeline — turn a ZettelFlow spec.md into a technical plan.md (approach, files by layer, Obsidian score-rule impact, test strategy, i18n and docs impact, rollback, risks). Use after a spec exists and the user says "plan this", "make the plan", or "how should we build spec N". Delegate to the implementation-planner agent.
---

# /plan — write the technical plan

Stage 2 of the [SDD pipeline](../../../specs/README.md). Given an approved `spec.md`, produce
`plan.md` in the same folder: **HOW** we satisfy the spec, with every Obsidian/ZettelFlow gate
made explicit *before* code is written.

## Owner

Delegate to the **`implementation-planner`** agent. Point it at the spec folder; it reads the
spec, the constitution, `CLAUDE.md`'s architecture map, and the code it will touch, then writes
the plan.

## Steps

1. Copy `specs/templates/plan.md` → `specs/NNNN-slug/plan.md`.
2. Fill every section — these are the gates:
   - **Approach** — which existing pattern it follows (action 4-file bundle, settings
     chain-of-responsibility, a `getInstance()` singleton, the Zustand wizard). Prefer extending a
     pattern over inventing one.
   - **Files touched** — a table by layer (`main → starters → config → architecture →
     actions/application/hooks`) so the blast radius is visible.
   - **Obsidian score impact (§I)** — name the `eslint-plugin-obsidianmd` rules this could trip
     and how it avoids them; state the expected `npm run lint:obsidian` delta (must be ≤ 0 new).
   - **Test strategy (§II)** — which units get a failing test first; which mock stubs to add to
     `test/__mocks__/obsidian.ts`.
   - **i18n impact (§IV)** — the exact `en.ts`/`es.ts` keys added/changed; confirm sentence case.
   - **Docs impact (§VIII)** — which `docs/` page + `mkdocs.yml` nav entry.
   - **Rollout & rollback** and **Risks** — flag fragile areas (the Canvas patcher, `monkey-around`,
     cross-platform).

## Quality bar (the stage-2 gate)

- The score delta is explicitly **zero-new-violations** (or the plan fixes violations).
- The test plan is real (named files + assertions), not "add tests".
- i18n and docs impact are named, not "update as needed".
- No unbounded refactors: if the plan balloons, split the spec.

Set the plan **Status: Approved**, then run `/tasks`.
