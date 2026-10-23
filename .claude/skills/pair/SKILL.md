---
name: pair
description: Augmented coding, step 3 — AI pair programming on one refined story. The assistant is the driver (writes the code), the user is the navigator (decides, reviews, says what not to build). Tiny test-first steps (one test → red → green → stop), a commit per accepted step so a touched test shows in the diff, refactor only when the navigator asks, and the three alarms (loops, unrequested additions, test cheating). Use when the user says "pair", "pair #N", "let's build it", "next test", "implement", or starts coding a story or bug fix.
---

# /pair — you drive, the user navigates

Step 3 of [augmented coding](../../../docs/development/augmented-coding.md) — Kent Beck's
*augmented coding*: the AI as a pair programmer, small steps guided by tests. The AI saves the
typing, never the thinking: the navigator decides what is built, what is not, and when to refactor.
Every step is small enough to read in a minute.

## Before the first step

- `gh issue view <N>` — the refined story (ACs, *Tests, in order*, out of scope, How to verify).
  No refined story? Run `story` first (a one-line bug: its reproduction is test 1).
- Branch `feature/<N>-<slug>` from `main` (or `fix/…`).
- Say which test is next and in one line what it asserts. Then go.

## The step (repeat)

1. **Red** — write **only** the next test from the list. Run it (`npx jest <file>`) and watch it fail
   for the right reason. Mechanics: the [`tdd`](../tdd/SKILL.md) skill.
2. **Green** — the **least** code that makes it pass. No layer, interface, option or helper the test
   does not need. Run the test, then the related suites.
3. **Stop and show** — the test, the diff in a few lines (files + what changed), the result. Name
   anything you were tempted to add and did not. Suggest the next step (next test, or a refactor
   you noticed) — as a suggestion, never done.
4. **Navigator's verdict** — *accept*: commit the step (Conventional Commit, `(#N)` in the subject);
   *modify*: change exactly what was asked, show again; *reject*: revert the step.
5. **Refactor** — only when the navigator asks, or accepts one you proposed. A refactor is its own
   step with the suite green before and after and **no test edited**, then its own commit.

The navigator may say **"run N"**: do N red→green steps without stopping, committing each green one,
then stop and show the N steps together. Any alarm below ends the run early.

Commit every accepted step — that is the safety net: a test, once committed, is visible if anything
later touches it.

## The three alarms — stop and say so

- **A loop.** The same failure twice, or a fix that undoes the previous one. Stop, show what you
  tried, ask. Do not try a third variant on your own.
- **An addition nobody asked for.** The diff touches a file, setting, string or behaviour the
  current test does not need, or something listed under *out of scope*. Remove it, or ask.
- **Cheating the tests.** Never edit, skip, weaken or delete a committed test to get green. If a
  test is wrong, say why and let the navigator decide; that change is its own step. `git diff` on
  `test/` is the first thing to read before every commit.

## Rules that hold at every step

The constitution, as it applies to a diff: facades not globals, `createEl` never `innerHTML`, `c()` +
SCSS never inline styles, `log` never `console.*`, the user's theme wins (§XV), sentence-case
strings in **both** `en.ts` and `es.ts` (`tCount` for counts), vault writes through `FileService` /
`FrontmatterService`, Canvas patches guarded. `npm run verify` green before the story's PR; for
score-touching work `npm run lint:obsidian` adds nothing.

## The story is done when

All tests on the list are green and committed, and then — each one a step the navigator sees:

1. **Docs audit (blocking).** Does any page under `docs/` need to reflect the change? New feature →
   update or create its page and the `mkdocs.yml` nav. New action → `docs/actions/<Name>.md`.
   Changed behaviour → the matching page. Illustrations are hand-drawn SVG. Pure refactor → say so.
2. **Placement by door rank (blocking for anything a user would care about).** Ask the capability's
   **door rank** ([capability doors](../../../docs/development/capability-doors.md)):
    - rank 1–3 and it asks something of the reader (a practice loop) → the README's
      **first screen**: one sentence, its door, a link — something else has to leave;
    - rank 1–3, an ordinary capability → a **headline entry** in the README, a few lines, linked;
    - rank 4–5 or configuration → **one line in the generated capability reference**
      (`docs/reference/capabilities.md`; `UPDATE_DOCS=1 npx jest capabilityIndex`) plus its own page.
   Never a new row in a features list (#588); `test/docs/readmeCeiling.test.ts` holds the ceiling.
3. **Walk the How to verify** — run the commands, walk the manual steps in a real vault
   (`npm run build` then `npm run deploy:vault`). Fix the script where it drifted; a manual step that
   could be automated becomes a test.
4. **Review** — `obsidian-plugin-quality` and the `obsidian-plugin-reviewer` agent on the diff.
5. **Ship** — push once, open the PR with `Closes #N` (or `Refs #N` if the owner wants to test
   first), squash-merge when CI is green so `main` gets one commit per story, delete the branch.

Then back to the backlog: the next story is picked by the user, not by you.
