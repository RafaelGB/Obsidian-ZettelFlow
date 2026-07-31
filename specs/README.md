# Spec-Driven Development (SDD) for ZettelFlow

This directory is the home of ZettelFlow's **development pipeline**. We build spec-first: intent
becomes a written **spec**, a spec becomes a technical **plan**, a plan becomes an ordered list of
**tasks**, and only then do we write code — test-first — against acceptance criteria the spec
fixed up front. Every stage has an owner (a skill or an agent) and a gate it must pass.

SDD fits ZettelFlow because the hardest part here isn't typing code — it's shipping a change that
**keeps the Obsidian quality score up**, stays cross-platform, keeps `en`/`es` in sync, and
doesn't break the fragile Canvas integration. Those constraints are cheap to honor in a spec and
expensive to retrofit after the fact. The pipeline front-loads them.

> New to the flow? Read the [constitution](constitution.md) (the invariants), then this file.
> The narrative version with examples is
> [`docs/development/spec-driven-development.md`](../docs/development/spec-driven-development.md).

## The pipeline

```
   idea / issue
        │
   0. constitution ......... invariants that gate every stage (constitution.md)
        │
   1. /specify ............. spec.md    — WHAT & WHY, testable acceptance criteria
        │
   2. /plan ............... plan.md     — HOW: design, files, score & i18n & test impact
        │
   3. /tasks .............. tasks.md    — ordered, TDD-sized, dependency-aware checklist
        │
   4. /implement .......... code + tests + commits (red → green → refactor, CI green each commit)
        │
   5. verify & review ..... score audit + guideline review + acceptance sign-off → Done
```

### Stages, owners and gates

| # | Stage | Command / skill | Owner (agent) | Output | Gate to pass |
|---|---|---|---|---|---|
| 0 | Constitution | — | (reference) | [`constitution.md`](constitution.md) | — |
| 1 | Specify | `/specify` | **`spec-author`** | `spec.md` | acceptance criteria are testable; capabilities disclosed; out-of-scope stated |
| 2 | Plan | `/plan` | **`implementation-planner`** | `plan.md` | files listed by layer; score-rule impact named; test + i18n + docs impact stated; rollback |
| 3 | Tasks | `/tasks` | **`implementation-planner`** | `tasks.md` | ordered TDD tasks, each with its failing test + the guardrail that proves it |
| 4 | Implement | `/implement` (+ `tdd`) | main assistant | code, tests, commits | `npm run verify` green before every commit; CI green on push; single branch |
| 5 | Verify & review | `obsidian-plugin-quality` + review | **`obsidian-plugin-reviewer`** | `review.md`, PR `Closes #N` | every acceptance criterion met; score held or raised; docs + `en`/`es` synced; issue in the PR's `Closes` set |

The agents in **bold** are defined in [`.claude/agents/`](../.claude/agents/); the skills are in
[`.claude/skills/`](../.claude/skills/). Stage 4 leans on the **`tdd`** skill; stage 5 leans on
the **`obsidian-plugin-quality`** skill; shipping uses the **`release`** skill.

## Directory layout

One folder per spec: `specs/NNNN-slug/`.

- **`NNNN`** = the GitHub **issue number** when the work has one (specs map 1:1 to issues), else a
  zero-padded sequence (`0001`, `0002`, …).
- **`slug`** = a short kebab-case title.

```
specs/
  constitution.md                 ← the invariants (stage 0)
  README.md                       ← this file
  templates/
    spec.md  plan.md  tasks.md    ← copy these into each spec folder
  0088-inline-styles/
    spec.md  plan.md  tasks.md    ← the artifacts for issue #88
    review.md                     ← (optional) stage-5 sign-off
```

## How to run it

Most of the time you invoke the stage skills in order and let the owning agent do the work:

1. `/specify <issue # or description>` → the `spec-author` writes `spec.md`.
2. `/plan <spec folder>` → the `implementation-planner` writes `plan.md`.
3. `/tasks <spec folder>` → the `implementation-planner` writes `tasks.md`.
4. `/implement <spec folder>` → work the tasks test-first, one commit per advance.
5. Run `obsidian-plugin-quality` and the `obsidian-plugin-reviewer` on the diff; check the
   acceptance criteria; add `Closes #N` to the PR body. Issues close when the PR merges to `main`
   — never from a feature-branch commit or `gh issue close` (constitution §X).

**Right-sizing.** A one-line, no-behavior change (typo, comment, dependency bump) may skip
straight to `/implement` — but anything that changes behavior, a public surface, UI text, or could
move the score goes through the full flow. When in doubt, write the spec: it's a few minutes and
it's where the Obsidian constraints get caught early.

**Parallelism.** Specs are independent units of work. You can `/specify` several issues up front,
then implement them one branch at a time. The pipeline is the contract; the branch discipline
(one `feature/*` branch, CI green per commit) comes from the [constitution](constitution.md) §IX.
