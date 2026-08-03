# Spec: <title>

- **Issue:** #<n> (or "none")
- **Status:** Draft | Planned | In progress | Done
- **Milestone / label:** <e.g. obsidian-score / M2-quality>
- **Owner:** spec-author

> Stage 1 of the [SDD pipeline](../README.md). This file is the source of truth for **WHAT** we
> build and **WHY**, and the acceptance criteria the change is measured against. No implementation
> detail here — that's the [plan](plan.md).

## Problem

<The user- or maintainer-facing problem, in 2–4 sentences. What hurts today?>

## Value

<Who benefits and how. If this is an `obsidian-score` item, state the score/guideline impact.>

## Functional requirements

Numbered so the plan and tasks can reference them.

- **FR-1** — <requirement>
- **FR-2** — <requirement>

## Acceptance criteria

Testable, Given/When/Then where possible. These are the stage-5 sign-off checklist.

- **AC-1** — Given <state>, when <action>, then <observable result>.
- **AC-2** — `npm run lint:obsidian` reports no new violations (rule: <name>).
- **AC-3** — <e.g. `es.ts` has every key `en.ts` has>.

## Capability disclosure (constitution §VII)

Does this change touch any of these? If yes, note it and confirm it's disclosed in README/docs.

- [ ] File-system access (read/write vault files beyond the active note)
- [ ] Network (calls to the community backend or any URL)
- [ ] Clipboard
- [ ] Script / code execution
- [ ] None of the above

## Out of scope

<What this change deliberately does NOT do, to keep it small.>

## Open questions

<Anything that must be resolved before or during planning. Remove when empty.>
