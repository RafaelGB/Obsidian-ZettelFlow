---
name: plan
description: Stage 2 of the SDD pipeline — turn a ZettelFlow spec (in the GitHub issue body) into a technical plan posted as an issue comment (approach, files by layer, Obsidian score-rule impact, test strategy, i18n and docs impact, rollback, risks). Use after a spec exists and the user says "plan this", "make the plan", or "plan issue #N". Delegate to the implementation-planner agent.
---

# /plan — write the technical plan as an issue comment

Stage 2 of the [SDD pipeline](../sdd/SKILL.md). Given an issue with an approved spec in its body,
the plan is posted as a **GitHub issue comment** — HOW we satisfy the spec, with every
Obsidian/ZettelFlow gate made explicit before code is written.

**No local files** — the plan lives in the GitHub issue as a comment.

## Owner

Delegate to the **`implementation-planner`** agent. Point it at the issue number; it reads the
spec (issue body), the constitution, `CLAUDE.md`'s architecture map, and the code it will touch,
then posts the plan comment.

## Steps

The agent posts a comment containing:

- **Approach** — which existing pattern it follows (action 4-file bundle, settings declarative
  definitions, a `getInstance()` singleton, the Zustand wizard). Prefer extending a pattern.
- **Files touched** — a table by layer so the blast radius is visible.
- **Obsidian score impact (§I)** — name the `eslint-plugin-obsidianmd` rules this could trip and
  how it avoids them; state the expected `npm run lint:obsidian` delta (must be ≤ 0 new).
- **Test strategy (§II)** — which units get a failing test first; which mock stubs to add.
- **i18n impact (§IV)** — the exact `en.ts`/`es.ts` keys added/changed; sentence case confirmed.
- **Docs impact (§VIII)** — which `docs/` page + `mkdocs.yml` nav entry.
- **Rollout & rollback** and **Risks** — flag fragile areas (Canvas patcher, monkey-around,
  cross-platform).

## Quality bar (the stage-2 gate)

- The score delta is explicitly **zero-new-violations** (or the plan fixes violations).
- The test plan is real (named files + assertions), not "add tests".
- i18n and docs impact are named, not "update as needed".
- No unbounded refactors: if the plan balloons, split the spec.

Then run `/tasks <issue #>`.
