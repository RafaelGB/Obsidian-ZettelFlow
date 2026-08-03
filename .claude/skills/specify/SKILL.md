---
name: specify
description: Stage 1 of the SDD pipeline — turn an issue or an idea into a ZettelFlow spec.md (problem, value, functional requirements, testable acceptance criteria, capability disclosure, out-of-scope). Use when the user says "specify", "write a spec", "spec out issue #N", or starts new non-trivial work. Delegate the writing to the spec-author agent.
---

# /specify — write the spec

Stage 1 of the [SDD pipeline](../../../specs/README.md). Produce `specs/NNNN-slug/spec.md`: the
source of truth for **WHAT** and **WHY**, with acceptance criteria the change is measured against
at stage 5. **No implementation detail** — that belongs in the [plan](../plan/SKILL.md).

## Owner

Delegate the authoring to the **`spec-author`** agent (it knows this template and the ZettelFlow
domain). Give it the issue number or the description; it reads the issue, the relevant code, and
`specs/constitution.md`, then writes the file.

## Steps

1. **Pick the folder.** `NNNN` = the GitHub issue number if the work has one (`gh issue view N`),
   else the next zero-padded sequence. Slug = short kebab-case title.
2. **Copy the template.** `specs/templates/spec.md` → `specs/NNNN-slug/spec.md`.
3. **Fill it in** from the issue + a quick read of the affected code:
   - **Problem / Value** — the user- or maintainer-facing pain; for `obsidian-score` items, name
     the guideline/score impact.
   - **Functional requirements** (`FR-n`) — numbered so plan/tasks can cite them.
   - **Acceptance criteria** (`AC-n`) — **testable**, Given/When/Then where possible. Always
     include the relevant guardrail (e.g. "`npm run lint:obsidian` reports no new `<rule>`
     violations", "`es.ts` has every key `en.ts` has").
   - **Capability disclosure** — tick file-system / network / clipboard / script-exec / none
     (constitution §VII). If a new capability is added, the spec says where it gets disclosed.
   - **Out of scope / Open questions** — keep the change small; surface unknowns now.

## Quality bar (the stage-1 gate)

- Every acceptance criterion is **observable and testable** — not "works well".
- Capabilities are disclosed.
- Scope is bounded (there is an explicit *out of scope*).
- No solution design leaked in (that's the plan's job).

Set the spec **Status: Planned** when it's ready for `/plan`.
