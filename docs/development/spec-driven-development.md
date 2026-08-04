# Spec-Driven Development (SDD)

ZettelFlow is built **spec-first**. Before code exists, a change is a written **spec** (what & why),
then a **plan** (how), then a list of **tasks** (test-first, one commit each). Only then do we
write code — and we measure it against acceptance criteria the spec fixed up front.

**Everything lives in GitHub Issues** — the spec is the issue body; the plan and task checklist
are issue comments. There is no local `specs/` directory.

The machine-readable rules are in the
[constitution](https://github.com/RafaelGB/Obsidian-ZettelFlow/blob/main/docs/development/constitution.md).
The harness skills live in [`.claude/`](https://github.com/RafaelGB/Obsidian-ZettelFlow/tree/main/.claude).

## Why spec-first for an Obsidian plugin

The expensive part of a ZettelFlow change is not writing the code. It's shipping a change that:

- **keeps the Obsidian quality score up** (the Community hub reviews every version — see
  [Obsidian review & scoring](obsidian-review-and-scoring.md)),
- stays **cross-platform** (desktop *and* mobile),
- keeps the **`en`/`es`** locales in sync and the UI in sentence case,
- updates the **docs**, and
- doesn't break the fragile **Canvas** integration.

Those constraints are cheap to honor in a spec and expensive to retrofit after code exists. SDD
front-loads them as **gates**: each stage has to clear its gate before the next begins.

## The pipeline

```
idea / issue → constitution → specify → plan → tasks → implement → verify & review → Done
```

| Stage | You run | The owner | It produces | Where it lives | Gate |
|---|---|---|---|---|---|
| 0. Constitution | read it | — | invariants | `docs/development/constitution.md` | the invariants below |
| 1. Specify | `/specify` | `spec-author` agent | spec | **issue body** | testable ACs; capabilities disclosed |
| 2. Plan | `/plan` | `implementation-planner` agent | technical plan | **issue comment** | files by layer; zero-new-violations score delta; test/i18n/docs impact |
| 3. Tasks | `/tasks` | `implementation-planner` agent | TDD checklist | **issue comment** | ordered tasks, each with its failing test |
| 4. Implement | `/implement` | main assistant + `tdd` skill | code, tests, commits | feature branch | `verify` green per commit; CI green; single branch |
| 5. Verify & review | quality audit + review | `obsidian-plugin-reviewer` agent | review findings | PR / issue comments | ACs met; score held/raised; docs + `en`/`es` synced |

Each stage is a **skill** in the harness (`sdd`, `specify`, `plan`, `tasks`, `implement`) plus the
existing `tdd`, `obsidian-plugin-quality` and `release` skills; the **agents** live in
[`.claude/agents/`](https://github.com/RafaelGB/Obsidian-ZettelFlow/tree/main/.claude/agents).

## The invariants (constitution)

Every spec and plan is gated on these — the full text is in
[`docs/development/constitution.md`](constitution.md):

1. **The score is a release gate** — no change lowers it; plans name the rules they could trip.
2. **Test-first** — behavior/bug changes land with a test that failed before; `verify` green per commit.
3. **Go through the facades** — `ObsidianApi`/`Vault`, `createEl`, `c()` + SCSS, `log`; never
   global `app`, `innerHTML`, inline `el.style.*`, or bare `console.*`.
4. **One surface, two locales, sentence case** — i18n in `en`+`es`; clean command ids; `setHeading()`.
5. **Cross-platform** — gate Node/Electron behind `Platform.isDesktop`; no lookbehind / `globalThis`.
6. **Defensive against internals** — the Canvas patcher guards every access and degrades gracefully.
7. **Disclose capabilities** — file-system / network / script-exec are documented.
8. **Docs ship with the change**.
9. **Small, conventional, single-branch** commits.
10. **Issues close on merge** via the PR (`Closes #N`), never from a feature-branch commit.

## Worked example (an `obsidian-score` issue)

Suppose issue #88 tracks the inline-styles migration:

1. `/specify 88` — the `spec-author` reads the issue, writes the spec into the **issue body**
   with `AC: no inline el.style.* remain in src` and `AC: lint:obsidian no-static-styles-assignment = 0`.
2. `/plan 88` — the `implementation-planner` reads the spec body, maps each inline style to a
   `c()` class + SCSS partial, posts the technical plan as an **issue comment** (delta: −12 violations).
3. `/tasks 88` — a second **issue comment** appears: one task per file/component, each with the
   guardrail `lint:obsidian no new no-static-styles-assignment`.
4. `/implement 88` — the assistant reads the issue (body + comments), migrates file by file,
   `npm run verify` green, one commit per file, push (CI green), checks off each task in the comment.
5. Run `obsidian-plugin-quality` + the reviewer, confirm the ACs, and add `Closes #88` to the PR
   body — #88 closes when the PR merges to `main`.

## When to skip stages

A one-line change with no behavior impact (typo, comment, dependency bump) can go straight to
`/implement`. Anything that changes behavior, a public surface, UI text, or could move the score
runs the full flow — writing the spec is a few minutes and it's where the Obsidian constraints get
caught early.
