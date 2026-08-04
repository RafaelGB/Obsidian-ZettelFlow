---
name: sdd
description: The Spec-Driven Development pipeline for ZettelFlow — the end-to-end flow (constitution → specify → plan → tasks → implement → verify) and which skill/agent owns each stage. Use when starting any non-trivial change, picking up an issue (especially obsidian-score work), or when the user asks to "follow the process", "spec this out", "how do we build features here", or "set up spec-driven development".
---

# Spec-Driven Development (SDD) — the ZettelFlow pipeline

ZettelFlow is built **spec-first**: intent → spec in the GitHub issue → plan comment → tasks
comment → code test-first → reviewed against the Obsidian quality score. This skill is the map.
The invariants are in [`docs/development/constitution.md`](../../../docs/development/constitution.md);
the narrative is [`docs/development/spec-driven-development.md`](../../../docs/development/spec-driven-development.md).

**Everything lives in GitHub Issues** — the spec is the issue body; the plan and tasks are issue
comments. No local `specs/` directory.

## Why spec-first here

The expensive part of a ZettelFlow change is not the code — it's shipping something that **keeps
the Obsidian score up**, stays cross-platform, keeps `en`/`es` in sync, updates docs, and doesn't
break the fragile Canvas patcher. Those are cheap to honor in a spec and expensive to retrofit.
The pipeline front-loads them as gates.

## The stages (invoke in order)

| # | Stage | Skill to invoke | Owner agent | Produces |
|---|---|---|---|---|
| 0 | Constitution | — (read it) | — | `docs/development/constitution.md` |
| 1 | Specify | `specify` | `spec-author` | Issue body (spec) |
| 2 | Plan | `plan` | `implementation-planner` | Issue comment (plan) |
| 3 | Tasks | `tasks` | `implementation-planner` | Issue comment (task checklist) |
| 4 | Implement | `implement` (+ `tdd`) | main assistant | code, tests, commits |
| 5 | Verify & review | `obsidian-plugin-quality` + `obsidian-plugin-reviewer` | reviewer agent | review comment, PR `Closes #N` |

## How to drive it

- **Starting an issue:** `specify <issue # or description>` → `plan <issue #>` → `tasks <issue #>` →
  `implement <issue #>` → run the quality audit + reviewer → open PR with `Closes #N`.
- **Tiny, no-behavior change** (typo, dep bump): skip to `implement`. Anything touching behavior,
  a public surface, UI text, or the score runs the full flow.
- **Branch & CI discipline** (constitution §IX): one `feature/*` branch; each commit is a coherent
  advance that leaves `npm run verify` green.

## Non-negotiables the pipeline enforces (constitution)

Score is a release gate (§I) · test-first (§II) · facades not globals, no `innerHTML`, no inline
styles (§III) · sentence-case i18n in `en`+`es`, clean commands/headings (§IV) · cross-platform
(§V) · defensive Canvas patcher (§VI) · disclose capabilities (§VII) · docs ship with the change
(§VIII) · small conventional single-branch commits (§IX) · issues close via PR merge, not manually
(§X).

## Related skills

`tdd` (stage-4 discipline) · `obsidian-plugin-quality` (stage-5 score audit) · `new-action`
(scaffold for adding a new action) · `release` (shipping a version).
