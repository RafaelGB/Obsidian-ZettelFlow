# Plan: Audit commands, settings headings, sentence-case UI; complete es.ts

- **Spec:** [spec.md](spec.md)
- **Status:** Approved
- **Owner:** implementation-planner

> Stage 2 of the [SDD pipeline](../README.md). This file is **HOW** we satisfy the spec.

## Approach

Pure i18n / UI-hygiene change, no behavior change. Work stays in the i18n layer
(`architecture/lang/locale`) and at the small number of call sites the Obsidian linter flags.
Casing fixes are made in the locale files, never at call sites, so every user-facing string keeps
living behind `t(...)`. `es.ts` is rewritten to mirror the final `en.ts` key-for-key (same order,
same section comments) so parity is structural, not just set-equality. Settings headings adopt the
existing `Setting(...).setHeading()` pattern already used elsewhere in the settings chain.

## Files touched

| File | Layer | Change |
|---|---|---|
| `src/architecture/lang/locale/en.ts` | architecture (i18n) | Sentence-case the Title Case values; fix `Zettelflow`→`ZettelFlow`; add keys `notice_codeview_registration_error`, `community_url_placeholder`. |
| `src/architecture/lang/locale/es.ts` | architecture (i18n) | Rewrite to mirror `en.ts` exactly: add 11 missing keys (Spanish), drop 5 dead keys, translate the 2 previously-English command labels, fix Spanish Title Case, add the 2 new keys. |
| `src/main.ts` | starters/plugin core | Import `t`; replace the hardcoded CodeView-registration `Notice` string with `t('notice_codeview_registration_error')`. |
| `src/config/modals/handlers/developer/CommunitySettingsHandler.ts` | config | `setPlaceholder("https://...")` → `setPlaceholder(t('community_url_placeholder'))`. |
| `src/config/modals/handlers/DeveloperSectionSettings.ts` | config | Import `Setting`; `createEl('h2', …)` → `new Setting(el).setName(t('developer_section_title')).setHeading()`. |
| `src/config/modals/handlers/HooksSectionSettings.ts` | config | Import `Setting`; `createEl('h2', …)` → `new Setting(el).setName(t('hooks_section_title')).setHeading()`. |

Commands (`RibbonIcon.ts`, `SettingsTab.ts`, `hooks/EditorMenu.ts`): **audited, no change needed** —
ids (`open-workflow`, `open-editor-workflow`→`editor-menu-flow`, `open-canvas`,
`open-community-templates`, `open-manage-templates`) and `t(...)` names contain no plugin id/name or
"command", and none ship `hotkeys`.

## Obsidian score impact (constitution §I)

- `obsidianmd/ui/sentence-case` — 2 → **0** (both flagged literals moved into i18n).
- `obsidianmd/settings-tab/no-manual-html-headings` / `no-problematic-settings-headings` — **0**
  (kept at 0; the `<h2>`→`setHeading()` conversion is guideline-preferred and future-proofs the
  headings even though the rule does not currently detect chain handlers).
- `obsidianmd/commands/*`, `no-default-hotkeys` — **0** (confirmed, no change).
- `obsidianmd/settings-tab/prefer-setting-definitions` — stays 1 (out of scope, see spec).
- No new violations of any rule; total ESLint problems 366 → 364.

## Test strategy (constitution §II)

Behavior is unchanged, so no new product-logic units. The guardrail is:
- Key-parity script comparing exported keys of `en.ts` and `es.ts` (same set + order).
- `npx eslint "src/**/*.{ts,tsx}"` before/after for the target rules.
- `npm run verify` (typecheck catches broken `t()` keys via `keyof typeof en`; jest 68 tests stay green).
- No Obsidian-mock additions needed. `test/**` is owned by another agent and is untouched.

## i18n impact (constitution §IV)

- New keys in `en.ts` **and** `es.ts`: `notice_codeview_registration_error`, `community_url_placeholder`.
- 11 keys added to `es.ts` to reach parity; 5 dead `es`-only keys removed.
- All UI text sentence case: yes (proper nouns preserved).

## Docs impact (constitution §VIII)

- None. No public surface, command, or setting name that the docs document changes meaning; the
  score snapshot in `docs/development/obsidian-review-and-scoring.md` §6/§7 already lists this audit
  as an action item (item 5) and needs no edit for this change.

## Rollout & rollback

Ships in the normal build (`npm run release`). Rollback is a straight revert of the six files;
there is no data migration or persisted state involved.

## Risks

- Low. The only visible change is label wording/casing and section-heading rendering (h2 →
  Setting heading row). No Canvas patcher, no monkey-around, no async paths touched.
- Spanish wording quality on the freshly translated keys — mitigated by the Open questions list for
  a native-speaker pass.
