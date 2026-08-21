---
name: obsidian-plugin-quality
description: Audit ZettelFlow against the official Obsidian plugin guidelines and the Community-hub automated review / quality score. Use before a release, when preparing a directory submission, or when the user asks to "check plugin quality", "raise the Obsidian score", "run the reviewer", or "prepare for submission". Runs the same rule set Obsidian's automated reviewer uses and reports concrete, file-anchored fixes.
---

# Obsidian plugin quality audit

Obsidian's Community hub (May 2026) runs an **automated review on every plugin version**
and publishes a **1–100 source-code quality score** plus safety scorecards. The score is
essentially *how clean the code is against `eslint-plugin-obsidianmd` + the developer
policies + the submission requirements*. This skill reproduces that audit locally.

Background reference (keep it in sync): `docs/development/obsidian-review-and-scoring.md`.

## When to use

- Before cutting a release or tagging a version.
- Before (re-)submitting to the community directory.
- When the user asks to improve the Obsidian score / pass the automated review.

## How to run the audit

Work through the phases in order. Report findings grouped by category, most-severe first,
each anchored to `file:line` with a concrete fix. Do **not** auto-apply large refactors
without confirming scope with the user first.

### Phase 1 — Run the official linter (the ground truth)

The project currently lints with `oxlint` and a legacy `.eslintrc.js`; neither encodes the
Obsidian rules. Add and run the official rule set:

```bash
npm i -D eslint eslint-plugin-obsidianmd @typescript-eslint/parser
# with an eslint.config.mjs using obsidianmd.configs.recommended (see the doc)
npx eslint "src/**/*.{ts,tsx}"
```

If the flat config is not yet present, create `eslint.config.mjs` as shown in
`docs/development/obsidian-review-and-scoring.md` §5. Treat every `eslint-plugin-obsidianmd`
error as a score deduction.

### Phase 2 — Fast static audit (grep the known anti-patterns)

Run these and triage each hit:

| Check | Command (ripgrep) | Rule / guideline |
|---|---|---|
| HTML injection | `rg -n "innerHTML|outerHTML|insertAdjacentHTML" src` | `no-forbidden-elements`, security. Replace `= ""` with `.empty()`; never assign HTML strings. |
| Inline styles | `rg -n "\.style\.|setAttribute\(['\"]style" src` | `no-static-styles-assignment` → move to CSS classes in `src/styles/`. |
| Detach leaves on unload | `rg -n "detachLeavesOfType" src` | `detach-leaves` → remove from `onunload`. |
| Hardcoded config dir | `rg -n "\.obsidian/" src` | `hardcoded-config-path` → use `vault.configDir`. |
| Node/Electron on mobile | `rg -n "require\(|from ['\"](fs|path|child_process|electron)" src` | `no-nodejs-modules` → gate behind `Platform.isDesktop` or set `isDesktopOnly`. |
| Global `app` | `rg -n "window\.app|\bapp\." src` | Use `this.app` / the `ObsidianApi` facade. |
| `var` / Promise chains | `rg -n "\bvar\s|\.then\(" src` | Prefer `const`/`let` and `async/await`. |
| Regex lookbehind | `rg -n "\(\?<" src` | `regex-lookbehind` → unsupported on some iOS. |
| Direct `activeLeaf` | `rg -n "workspace\.activeLeaf" src` | Use `getActiveViewOfType()`. |
| Adapter over Vault | `rg -n "\.adapter\." src` | Prefer the `Vault` API. |

### Phase 3 — Manifest & release hygiene

- [ ] `manifest.json`: valid `id`, `name`, semver `version`, `minAppVersion`, `description`
      (≤250 chars, action verb, ends with `.`, not starting "This is a plugin"), `author`.
- [ ] `fundingUrl` present only because donations are accepted (ZettelFlow: yes).
- [ ] `versions.json` **exists** and maps each version → `minAppVersion`.
      ⚠️ **Currently missing** — see `docs/development/obsidian-review-and-scoring.md` §6.
- [ ] `version-bump.mjs` exists (referenced by the `version` npm script). ⚠️ **Currently missing.**
- [ ] Release workflow attaches `main.js`, `manifest.json`, `styles.css` under a git tag
      **equal to** `manifest.version` (no `v` prefix). Cross-check `.github/workflows/releases.yml`.
- [ ] `LICENSE` present with a valid copyright notice (`validate-license`).

### Phase 4 — Commands, settings & UI text

- [ ] Command ids/names don't repeat the plugin id/name or the word "command".
- [ ] No default hotkeys shipped.
- [ ] Settings headings use `setHeading()` (not manual HTML), no "settings" in the heading text.
- [ ] All user-facing strings are **Sentence case**, not Title Case. (ZettelFlow has an
      i18n layer at `src/architecture/lang/` — audit `en`/`es` locale strings too.)

### Phase 5 — ZettelFlow-specific risk review

- **Canvas monkey-patching** (`src/architecture/plugin/canvas/extensions/CanvasPatcher.ts`)
  patches internal Canvas APIs via `monkey-around`. This is a manual-review flag: keep the
  patches defensive (they already register uninstallers via `plugin.register`), guard every
  patched method behind existence checks, and document the risk. Verify against the current
  `minAppVersion`.
- **`.js` extension registration** (`CodeView`): already wrapped in try/catch — keep it.
- **Logger gating** (`src/architecture/monitoring/Logger.ts`): `error` is silenced when the
  logger toggle is off. Consider always allowing `error`.
- **`onunload`** only clears the action store; confirm no leaked resources (most are covered
  by Obsidian's `register*` auto-teardown).

### Phase 6 — The transformation gate (constitution §XI)

Beyond the linter, judge the change against the design gate:

- **Transformation.** Ask "what knowledge transformation does this enable?" Flag surface that
  doesn't transform/connect/evaluate/discover/advance knowledge as secondary.
- **No net complexity.** The change removes/merges a command, view, setting or path, or hardens a
  boundary — it doesn't *only* add. Rising net surface is a finding.
- **Boundaries.** The Knowledge layer (`architecture/knowledge`, future `knowledge/`) imports **no**
  `obsidian` and makes no network/AI call; derived metrics are queries over the model, not new
  dashboard features. Existing `.zftemplate` systems and saved settings still work; no command/view
  removed without an alias.

## Output format

Produce a prioritized report: (1) blocking submission issues (missing `versions.json`,
manifest errors), (2) `eslint-plugin-obsidianmd` errors, (3) security (HTML injection),
(4) styling/inline-style migrations, (5) polish (sentence case, commands). For each: the
rule, the `file:line`, and the exact fix. Offer to apply the low-risk mechanical fixes
(`innerHTML = "" → .empty()`, adding the eslint config) in a follow-up.
