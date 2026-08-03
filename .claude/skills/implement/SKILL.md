---
name: implement
description: Stage 4 of the SDD pipeline — execute a ZettelFlow tasks.md test-first (red → green → refactor), one commit per advance, keeping npm run verify green and CI green on every commit on a single feature branch. Use after tasks.md exists and the user says "implement", "build spec N", "work the tasks", or "start coding". Drives the tdd skill.
---

# /implement — build the tasks test-first

Stage 4 of the [SDD pipeline](../../../specs/README.md). Work `tasks.md` top to bottom using the
**`tdd`** discipline. This stage is done by the main assistant (not a subagent) because it commits
to the branch and must keep CI green at every step.

## The loop (per task)

1. **Red** — write/extend the test named in the task; run `npm test` and watch it fail for the
   right reason. Import from `@jest/globals`; resolve source via the bare aliases; extend
   `test/__mocks__/obsidian.ts` when the unit pulls in more Obsidian API (see the `tdd` skill).
2. **Green** — make the minimal change to pass.
3. **Refactor** — clean up with the suite green.
4. **Verify** — `npm run verify` (typecheck + oxlint + jest) must be green. For score tasks also
   run `npm run lint:obsidian` and confirm **no new** violations. For i18n tasks confirm
   `en.ts`/`es.ts` key parity.
5. **Commit** — one Conventional Commit per completed task/advance (constitution §IX):
   `git add -A && git commit -m "<type>(<scope>): <subject>"`. Mark the task `[x]` in `tasks.md`.
6. **Keep CI green** — push the branch; the CI workflow re-runs the blocking guardrails. Because
   `verify` is green locally, CI stays green. Fix forward if a push ever goes red — don't stack
   more commits on a red branch.

## Rules

- **Single branch** — one `feature/*` branch for the whole spec; never commit to `main`.
- **Never** introduce `innerHTML`, inline `el.style.*`, Title-case UI strings, bare `console.*`,
  or global `app` — they cost score (constitution §III–IV). Build DOM with `createEl`; style with
  `c()` + SCSS; log with `log`.
- Touching the **Canvas patcher**? Keep every patched access guarded and uninstalled on unload
  (§VI) — see issue #91 / the reviewer agent.
- Update the matching `docs/` page + `mkdocs.yml` nav in the **same** commit that changes behavior
  (§VIII).

## Exit → stage 5

When all tasks are `[x]`: run the **`obsidian-plugin-quality`** skill and the
**`obsidian-plugin-reviewer`** agent on the diff, verify every acceptance criterion in `spec.md`,
write an optional `review.md`, and set the spec **Status: Done**.

**Closing the issue (constitution §X).** Commits only *reference* the issue (`(#N)`) — they never
close it. The issue is closed by the **pull request** that merges the branch to `main`: put
`Closes #N` (one line per addressed issue) in the **PR body**. Do not `gh issue close` from the
feature branch and do not put closing keywords in commit messages. "Issue closed" is realised when
the PR merges.
