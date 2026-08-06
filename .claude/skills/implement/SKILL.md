---
name: implement
description: Stage 4 of the SDD pipeline — execute a ZettelFlow task checklist (in a GitHub issue comment) test-first (red → green → refactor), one commit per advance, keeping npm run verify green and CI green on every commit on a single feature branch. Use after a tasks comment exists and the user says "implement", "build issue #N", "work the tasks", or "start coding". Drives the tdd skill.
---

# /implement — build the tasks test-first

Stage 4 of the [SDD pipeline](../sdd/SKILL.md). Work the task checklist (in the GitHub issue
comment) top to bottom using the **`tdd`** discipline. This stage is done by the main assistant
(not a subagent) because it commits to the branch and must keep CI green at every step.

## Before starting

Run `gh issue view <N>` — read the spec (body) and the plan + tasks comments. The tasks comment
has the checklist; the plan comment has the files, guardrails, and risks.

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
   `git add -A && git commit -m "<type>(<scope>): <subject>"`.
6. **Check off the task** — mark `[x]` directly in the GitHub issue comment (edit the comment with
   `gh issue comment <comment-id> --edit-last` or find the comment id and patch it).
7. **Keep CI green** — push the branch; the CI workflow re-runs the blocking guardrails. Because
   `verify` is green locally, CI stays green. Fix forward if a push ever goes red — don't stack
   more commits on a red branch.

## Rules

- **Single branch** — one `feature/*` branch for the whole issue; never commit to `main`.
- **Never** introduce `innerHTML`, inline `el.style.*`, Title-case UI strings, bare `console.*`,
  or global `app` — they cost score (constitution §III–IV). Build DOM with `createEl`; style with
  `c()` + SCSS; log with `log`.
- Touching the **Canvas patcher**? Keep every patched access guarded and uninstalled on unload
  (§VI) — see issue #91 / the reviewer agent.
- Update the matching `docs/` page + `mkdocs.yml` nav in the **same** commit that changes behavior
  (§VIII).

## Exit → stage 5

When all tasks are checked off, do **four things before declaring done**:

### 1. Docs audit (mandatory)

For every user-facing change — new feature, changed behaviour, new config option, new action,
changed UI text — ask: *does the existing docs page cover this?*

- **New feature / behaviour change** → update the matching page under `docs/` AND check the
  `mkdocs.yml` nav (add an entry if the feature deserves its own page).
- **New action** → add or update `docs/actions/<ActionName>.md`.
- **New config option** → update the settings section of the relevant architecture page.
- **API / public surface change** → update `docs/api/ZettelFlowAPI.md`.
- **No user-facing change** (pure refactor, test, chore) → docs audit is still required; confirm
  explicitly that no doc update is needed and state why.

This audit is a **blocking exit criterion** — do not commit the implementation without it.
Docs and code travel in the same commit (or a `docs:` follow-up commit immediately after).

### 2. README showcase audit (mandatory for user-facing features)

Adoption is a first-class goal: the main `README.md` is how new users decide to install. For every
change that ships something a *user* would care about — a new command, sidebar view, action, or
workflow — ask: *would a prospective user find this in the README?*

- **New user-facing feature** → add a row to the **Features** table. For a **headline** capability
  (a whole new tool/view/workflow, not a minor option) also add a bullet to the
  **Zettelkasten toolkit** section near the top, phrased as user value (what it does for them).
- **New action** → also bump the "N built-in actions" row count and list.
- **No user-facing surface** (pure refactor, internal fix) → state explicitly that no README change
  is needed.

Like the docs audit, this is a **blocking exit criterion** — a shipped-but-unadvertised feature is
a missed download. README and code travel in the same change.

### 3. Quality check

Run the **`obsidian-plugin-quality`** skill and the **`obsidian-plugin-reviewer`** agent on the
diff, and verify every acceptance criterion in the issue spec (body).

### 4. Close the issue via PR

**Closing the issue (constitution §X).** Commits only *reference* the issue (`(#N)`) — they never
close it. The issue is closed by the **pull request** that merges the branch to `main`: put
`Closes #N` (one line per addressed issue) in the **PR body**. Do not `gh issue close` from the
feature branch and do not put closing keywords in commit messages. "Issue closed" is realised when
the PR merges.
