# Spec: Audit commands, settings headings, sentence-case UI; complete es.ts

- **Issue:** #92
- **Status:** Done
- **Milestone / label:** obsidian-score / M2-quality
- **Owner:** spec-author

> Stage 1 of the [SDD pipeline](../README.md). This file is the source of truth for **WHAT** we
> build and **WHY**, and the acceptance criteria the change is measured against.

## Problem

Three Obsidian-score liabilities sit in ZettelFlow's UI layer (see
`docs/development/obsidian-review-and-scoring.md` §3.3):

1. **`es.ts` was out of sync with `en.ts`** — 271 keys vs 277, with 11 keys missing (users on
   Spanish saw raw key names or English fallbacks) and 5 dead keys present only in `es`.
2. **Title Case UI strings** — many user-facing labels used Title Case ("Community Templates",
   "Property Hooks", "Add Hook", "Custom Types", …) instead of Obsidian's required sentence case,
   plus two hardcoded strings tripped `obsidianmd/ui/sentence-case`.
3. **Settings headings built with manual `<h2>`** — the Developer and Hooks section handlers used
   `containerEl.createEl('h2', …)` instead of `Setting.setHeading()`.

## Value

Raises the automated-review quality score: removes the `obsidianmd/ui/sentence-case` violations,
brings settings headings onto the guideline-preferred `setHeading()` API, and restores full
`en`/`es` parity (constitution §IV). Spanish users get a fully translated UI again.

## Functional requirements

- **FR-1** — `es.ts` has exactly the same keys as `en.ts`, in the same order, no missing/extra/dupes.
- **FR-2** — Every added/changed Spanish string is a real translation (not the English text) and
  uses Spanish sentence case, keeping proper nouns (ZettelFlow, Obsidian, Canvas, CSS, URL) capitalized.
- **FR-3** — User-facing Title Case strings in the locale files are converted to sentence case;
  proper nouns stay capitalized.
- **FR-4** — The two hardcoded user-facing strings that tripped `obsidianmd/ui/sentence-case`
  (`main.ts` Notice, `CommunitySettingsHandler` placeholder) move into the i18n layer with keys in
  both `en.ts` and `es.ts`.
- **FR-5** — Every `addCommand()` id/name is free of the plugin id (`zettelflow`), the plugin name
  (`ZettelFlow`) and the word "command", and no command ships default `hotkeys`.
- **FR-6** — Settings-tab section headings use `Setting.setHeading()` (not manual `<h*>`), and no
  heading text contains the word "settings".

## Acceptance criteria

- **AC-1** — A key-parity check reports `en` and `es` with identical key sets and order
  (before: en 277 / es 271; after: **279 / 279**, 0 missing, 0 extra, 0 duplicate).
- **AC-2** — `npx eslint "src/**/*.{ts,tsx}"` reports **0** `obsidianmd/ui/sentence-case*` problems
  (down from 2) and no new violations of any rule.
- **AC-3** — `npx eslint …` reports **0** `obsidianmd/commands/*` problems and **0**
  `obsidianmd/settings-tab/no-manual-html-headings` / `no-problematic-settings-headings` problems.
- **AC-4** — `npm run verify` (typecheck + oxlint + jest) is green.
- **AC-5** — No user-facing string literals remain at the two flagged call sites; both resolve via
  `t(...)` with keys present in `en.ts` and `es.ts`.

## Capability disclosure (constitution §VII)

- [x] None of the above — UI text, i18n and lint-hygiene only; no new FS/network/clipboard/eval.

## Out of scope

- **`obsidianmd/settings-tab/prefer-setting-definitions`** (1 finding on `ZettelFlowSettingsTab`).
  Satisfying it means implementing `getSettingDefinitions()` — re-declaring the whole
  chain-of-responsibility settings UI declaratively so it appears in Obsidian's settings search.
  That is a substantial architectural change and the API is newer than our `minAppVersion` (1.7.2),
  so it risks `no-unsupported-api`. Tracked separately.
- Migrating other hardcoded strings that ESLint does not flag (broader i18n coverage).
- The manual `<h2>` inside `ObsidianTypesModal` (a Modal navbar, not a `PluginSettingTab`).

## Open questions

Terms translated with a judgment call (flagged for a native reviewer):
- "rollover" (task-management) → rendered as *trasladar / traslado* in Spanish.
- "logger" → kept the English loanword with a Spanish gloss: *registro (logger)*.
- "backlink", "frontmatter", "prompt", "hook", "script", "vault", "canvas", "markdown" → kept as
  established loanwords, consistent with the pre-existing `es.ts` usage.
