# Tasks: Audit commands, settings headings, sentence-case UI; complete es.ts

- **Plan:** [plan.md](plan.md)
- **Owner:** implementation-planner → main assistant (implement)

> Stage 3 of the [SDD pipeline](../README.md). Ordered, dependency-aware checklist.

## Legend

- `[ ]` todo · `[~]` in progress · `[x]` done

## Tasks

- [x] **T1 — Commands audit** (covers FR-5)
  - Red: grep `addCommand(` across `src/`; assert each id/name has no plugin id/name or "command",
    and no `hotkeys`.
  - Green: no violations found — no code change.
  - Guardrail: `npx eslint` → 0 `obsidianmd/commands/*`, 0 `no-default-hotkeys`.

- [x] **T2 — Sentence-case the locale strings + fix a proper noun** (covers FR-3)
  - Red: scan `en.ts` for Title Case in user-facing values.
  - Green: lowercase non-first, non-proper-noun words ("Community templates", "Property hooks",
    "Add hook", "Custom types", "Task management", …); fix `Zettelflow`→`ZettelFlow`; capitalize
    `default_selector_title`.
  - Guardrail: `npm run verify` green.

- [x] **T3 — Move the 2 ESLint-flagged hardcoded strings into i18n** (covers FR-4, AC-2, AC-5)
  - Red: `npx eslint` reports 2 `obsidianmd/ui/sentence-case` (main.ts Notice, community placeholder).
  - Green: add `notice_codeview_registration_error` + `community_url_placeholder` to `en.ts`; import
    `t` in `main.ts` and swap both call sites to `t(...)`.
  - Guardrail: `npx eslint` → 0 `obsidianmd/ui/sentence-case*`.

- [x] **T4 — Settings headings → `setHeading()`** (covers FR-6, AC-3)
  - Red: `DeveloperSectionSettings`/`HooksSectionSettings` build headings with `createEl('h2')`.
  - Green: import `Setting`; replace each with `new Setting(el).setName(t(...)).setHeading()`.
    Confirm heading text ("Developer", "Hooks") has no "settings".
  - Guardrail: `npm run verify` green; `npx eslint` settings-tab heading rules stay 0.

- [x] **T5 — Complete `es.ts` to full parity** (covers FR-1, FR-2, AC-1)
  - Red: key-parity script shows en 279 vs es 271 (11 missing, 5 extra) after T2–T3.
  - Green: rewrite `es.ts` mirroring `en.ts` key order; add the 11 missing + 2 new keys with
    Spanish translations; drop the 5 dead keys; translate the 2 English command labels; fix Spanish
    Title Case.
  - Guardrail: parity script → 279/279, 0 missing/extra/dupes, same order; `npm run verify` green.

- [x] **T6 — Final verification** (covers AC-2, AC-3, AC-4)
  - Green: run `npm run verify` and `npx eslint "src/**/*.{ts,tsx}"`; record before/after target-rule
    counts.
  - Guardrail: verify green; target UI rules at 0; no new violations.

## Definition of done

- [x] All tasks `[x]`.
- [x] Every acceptance criterion in the [spec](spec.md) verified (except the explicitly
  out-of-scope `prefer-setting-definitions`).
- [x] Docs + `en`/`es` synced (279/279).
