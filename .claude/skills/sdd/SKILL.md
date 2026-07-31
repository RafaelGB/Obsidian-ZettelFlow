---
name: sdd
description: The Spec-Driven Development pipeline for ZettelFlow — the end-to-end flow (constitution → specify → plan → tasks → implement → verify) and which skill/agent owns each stage. Use when starting any non-trivial change, picking up an issue (especially obsidian-score work), or when the user asks to "follow the process", "spec this out", "how do we build features here", or "set up spec-driven development".
---

# Spec-Driven Development (SDD) — the ZettelFlow pipeline

ZettelFlow is built **spec-first**: intent → `spec.md` → `plan.md` → `tasks.md` → code, written
test-first against acceptance criteria fixed up front, then reviewed against the Obsidian quality
score. This skill is the map. The full reference lives in [`specs/README.md`](../../../specs/README.md)
and [`specs/constitution.md`](../../../specs/constitution.md) (the invariants); the narrative is
[`docs/development/spec-driven-development.md`](../../../docs/development/spec-driven-development.md).

## Why spec-first here

The expensive part of a ZettelFlow change is not the code — it's shipping something that **keeps
the Obsidian score up**, stays cross-platform, keeps `en`/`es` in sync, updates docs, and doesn't
break the fragile Canvas patcher. Those are cheap to honor in a spec and expensive to retrofit.
The pipeline front-loads them as gates.

## The stages (invoke in order)

| # | Stage | Skill to invoke | Owner agent | Produces |
|---|---|---|---|---|
| 0 | Constitution | — (read it) | — | `specs/constitution.md` |
| 1 | Specify | `specify` | `spec-author` | `specs/NNNN-slug/spec.md` |
| 2 | Plan | `plan` | `implementation-planner` | `.../plan.md` |
| 3 | Tasks | `tasks` | `implementation-planner` | `.../tasks.md` |
| 4 | Implement | `implement` (+ `tdd`) | main assistant | code, tests, commits |
| 5 | Verify & review | `obsidian-plugin-quality` + `obsidian-plugin-reviewer` | reviewer | `review.md`, closed issue |

`NNNN` = the GitHub issue number when there is one, else a zero-padded sequence. One folder per
spec under `specs/`.

## How to drive it

- **Starting an issue:** `specify <issue #>` → `plan <folder>` → `tasks <folder>` →
  `implement <folder>` → run the quality audit + reviewer → close the issue.
- **Tiny, no-behavior change** (typo, dep bump): skip to `implement`. Anything touching behavior,
  a public surface, UI text, or the score goes through the full flow.
- **Branch & CI discipline** (constitution §IX): one `feature/*` branch; each commit is a coherent
  advance that leaves `npm run verify` green so CI passes at every commit.

## Non-negotiables the pipeline enforces (constitution)

Score is a release gate (§I) · test-first (§II) · facades not globals, no `innerHTML`, no inline
styles (§III) · sentence-case i18n in `en`+`es`, clean commands/headings (§IV) · cross-platform
(§V) · defensive Canvas patcher (§VI) · disclose capabilities (§VII) · docs ship with the change
(§VIII) · small conventional single-branch commits (§IX).

## Related skills

`tdd` (the stage-4 discipline) · `obsidian-plugin-quality` (the stage-5 score audit) · `new-action`
(the scaffold for the specific case of adding an action) · `release` (shipping a version).
