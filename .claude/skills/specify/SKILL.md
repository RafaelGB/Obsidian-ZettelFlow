---
name: specify
description: Stage 1 of the SDD pipeline — write a ZettelFlow spec into a GitHub issue body (problem, value, functional requirements, testable acceptance criteria, capability disclosure, out-of-scope). Use when the user says "specify", "write a spec", "spec out issue #N", or starts new non-trivial work. Delegate the writing to the spec-author agent.
---

# /specify — write the spec into the GitHub issue

Stage 1 of the [SDD pipeline](../sdd/SKILL.md). The spec is the **issue body** — it fixes WHAT
and WHY, with acceptance criteria the change is measured against at stage 5.

**No local files** — specs live in GitHub Issues, not in a `specs/` directory.

## Owner

Delegate to the **`spec-author`** agent. Give it the issue number or a description; it reads the
issue, the relevant code, and `docs/development/constitution.md`, then writes the spec.

## Steps

1. **If an issue number is given**: `gh issue view <N>` to read the existing body. The agent will
   update it with the spec content using `gh issue edit <N> --body "..."`.
2. **If new work with no issue**: the agent creates a new issue with `gh issue create --title "..." --body "..."`.
3. **Spec content** (always in the issue body):
   - **Problem / Value** — the user- or maintainer-facing pain; for `obsidian-score` items, name
     the guideline/score impact.
   - **Functional requirements** (`FR-n`) — numbered, atomic, so plan/tasks can cite them.
   - **Acceptance criteria** (`AC-n`) — **testable**, Given/When/Then where possible. Always
     include the concrete guardrail (e.g. "`npm run lint:obsidian` reports no new violations",
     "`es.ts` has every key `en.ts` has").
   - **Capability disclosure** — tick file-system / network / clipboard / script-exec / none
     (constitution §VII).
   - **Out of scope / Open questions** — keep the change small; surface unknowns now.

## Quality bar (the stage-1 gate)

- Every acceptance criterion is **observable and testable** — not "works well".
- Capabilities are disclosed.
- Scope is bounded (explicit *out of scope*).
- No solution design leaked in.

Add the `sdd:planned` label when the spec is ready for `/plan`.
