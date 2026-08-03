# Spec: Migrate inline styles to CSS classes

- **Issue:** #88
- **Status:** Done
- **Milestone / label:** obsidian-score / M2-quality
- **Owner:** spec-author

> Stage 1 of the [SDD pipeline](../README.md).

## Problem

Widespread inline `el.style.*` assignments across community/config modals and a couple of React
components violate `obsidianmd/no-static-styles-assignment` and lower the Obsidian quality score.

## Value

Removing them raises the automated-review score (12 `no-static-styles-assignment` errors) and
keeps styling in the SCSS layer where the theme variables live (constitution §III).

## Functional requirements

- **FR-1** — No `el.style.<prop> = …` assignments remain in `src/`.
- **FR-2** — Show/hide toggles use CSS-class toggling (`is-hidden`/`is-visible`); dynamic values
  (computed node colours) use `setCssProps` + a CSS custom property consumed by SCSS.
- **FR-3** — Visible behaviour is unchanged (hidden stays hidden, colours still render).

## Acceptance criteria

- **AC-1** — `npm run lint:obsidian` reports **0** `obsidianmd/no-static-styles-assignment`
  problems (down from 12) and no new violations of any rule.
- **AC-2** — `rg "\.style\.\w+\s*=" src` returns nothing (no inline style assignments).
- **AC-3** — `npm run verify` (typecheck + oxlint + jest) is green.

## Capability disclosure (constitution §VII)

- [x] None of the above — pure styling refactor.

## Out of scope

- `prefer-create-el` warnings (createElement → createEl) — that's a separate rule/issue.
- Reworking the accordion animation or the community modal layout.

## Open questions

None.
