# Plan: <title>

- **Spec:** [spec.md](spec.md)
- **Status:** Draft | Approved
- **Owner:** implementation-planner

> Stage 2 of the [SDD pipeline](../README.md). This file is **HOW** we satisfy the spec. Every
> section is a gate the plan must clear before implementation starts.

## Approach

<The technical strategy in a few sentences. Which existing pattern does it follow
(action 4-file bundle? settings chain-of-responsibility? a getInstance() singleton?).>

## Files touched

By layer, so the blast radius is visible (see the architecture map in `CLAUDE.md`).

| File | Layer | Change |
|---|---|---|
| `src/...` | actions / application / architecture / hooks / config | <what & why> |

## Obsidian score impact (constitution §I)

Which `eslint-plugin-obsidianmd` rules could this change trip, and how does it avoid them?
State the expected `npm run lint:obsidian` delta (should be ≤ 0 new problems).

- Rule `<name>` — <how avoided / how many fixed>.

## Test strategy (constitution §II)

Test-first. Which units get a failing test before the change?

- `test/<area>/<Name>.test.ts` — <what it asserts; which FR/AC it covers>.
- Obsidian-mock additions needed in `test/__mocks__/obsidian.ts`: <list or none>.

## i18n impact (constitution §IV)

- New/changed keys in `architecture/lang/locale/en.ts` **and** `es.ts`: <list or none>.
- All UI text sentence case: yes / n-a.

## Docs impact (constitution §VIII)

- Page(s) to update: `docs/...`.
- `mkdocs.yml` nav change: <yes/no; where>.

## Rollout & rollback

<How it ships (normal build / release skill). How to revert safely if it regresses.>

## Risks

<Fragile areas touched (Canvas patcher? monkey-around?), cross-platform concerns, anything the
reviewer should scrutinize.>
