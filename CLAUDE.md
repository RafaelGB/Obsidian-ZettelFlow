# CLAUDE.md — ZettelFlow harness

Guidance for AI assistants (and humans) working in this repo. This is the **project harness**:
a high-signal map, the conventions, the commands, and the Obsidian-specific rules that keep
changes shippable. It is committed to git on purpose. Deep detail lives in [`docs/`](docs/) —
this file points you there rather than duplicating it.

## What this project is

**ZettelFlow** is an **Obsidian plugin** (TypeScript + React 19 + Zustand + CodeMirror 6, bundled
by esbuild) that turns a native **Canvas** into a note-creation **workflow**: a wizard walks the
canvas graph (root → steps → actions) and generates a note by merging step templates and running
each step's **actions**. It's a monorepo:

- `src/` + `manifest.json` — **the plugin** (the product).
- `docs/` + `mkdocs.yml` — the MkDocs Material site (GitHub Pages). The community gallery is
  **fully static**: `docs/main_template.json` + `docs/systems/*.zftemplate` served over GitHub raw
  (no backend — #294).

Current version: `3.3.0`, `minAppVersion 1.13.1`, desktop **and** mobile (`isDesktopOnly:false`).

## Architecture in 60 seconds

```
main.ts (Plugin)
 → starters/     bootstrap: ZComponents (RibbonIcon, SettingsTab, PluginApi), {{frontmatter}} processors
 → config/       ZettelFlowSettings + DEFAULT_SETTINGS + settings tab (General/Hooks/Developer, chain-of-responsibility)
 → architecture/ the internal framework:
     api/        ActionsStore (Map singleton), CustomZettelAction base, fnsManager (the `zf` script API), ZfVault/ZfScripts
     plugin/     ObsidianApi facade, Lifecycle, canvas/ (CanvasPatcher via monkey-around), services, VaultStateManager
     components/  core (CodeView = CodeMirror .js editor, search), settings modals
     monitoring/  Logger, custom exceptions   ·   patterns/ AbstractChain   ·   lang/ i18n (en/es)   ·   styles/ c() prefixer
 → actions/      **31** built-in actions in 5 categories (manipulation 11 · knowledge 6 · ai 6 ·
                 research 4 · relations 4), each a 4-file bundle (Action/Component/Settings/SettingsReader)
 → application/  notes/ (NoteBuilder + ContentDTO + NoteDTO), components/noteBuilder (Zustand wizard), community/ (static GitHub-backed gallery)
 → zettelkasten/ step/flow editor modals (StepBuilderModal, SelectorMenuModal, installed editors)
 → hooks/        vault hooks: folder automation + property hooks + context-menu integrations
```

**The five layers (the organizing principle, epic #144).** Conceptually the code is understood as
**Knowledge Model** (the pure `architecture/knowledge/` idea graph) → **Workflow Engine** (canvas →
note: `main.ts`/`starters`, `architecture/api`, `actions`, `application/notes` engine + `zettelkasten`
+ `architecture/plugin` canvas/services + `hooks`) → **Knowledge State** (analyses over the model:
`architecture/knowledge/{debt,review,balance,discovery,map,traverse,questions,timeline,synthesis,dashboard,home,projects,journal}`)
→ **Experience** (`architecture/components/core` views + `config` settings UX) → **Community Gallery**
(`application/community` — the Systems Gallery), over a cross-cutting **Foundation**
(`lang`/`styles`/`monitoring`/`ai`/`plugin` facade). Every capability has one home layer; the full
inventory is [`docs/architecture/reposition-map.md`](docs/architecture/reposition-map.md). The `src/`
folders are being repositioned to match, incrementally — nothing is deleted or renamed.

Full detail: [`docs/architecture/overview.md`](docs/architecture/overview.md) and the pages it
links (plugin core, actions & note builder, vault hooks, the static community gallery).

## Commands

| Task | Command |
|---|---|
| Dev build + watch | `npm run dev` |
| Dev build + watch + auto-deploy to test vault | `npm run dev:vault` (needs `.vault-path`) |
| One-shot deploy to test vault | `npm run deploy:vault` (needs `.vault-path`) |
| Production build (type-check + minify → `dist/`) | `npm run release` |
| Lint (blocking) | `npm run lint` (oxlint) / `npm run lint:fix` |
| Type-check (blocking) | `npm run typecheck` |
| Test — TDD (blocking) | `npm test` / `npm run test:watch` / `npm run test:coverage` |
| Verify all (pre-push + CI) | `npm run verify` |
| Performance budgets (blocking, own CI job) | `npm run test:perf` — see [budgets](docs/development/performance-budgets.md) |
| Obsidian-guideline lint (blocking) | `npm run lint:obsidian` — clean (0), part of `verify`/CI |
| Docs preview | `mkdocs serve` |

Build output (`dist/`) is git-ignored. Releases are cut by **pushing a git tag**
(`.github/workflows/releases.yml` uploads `main.js`/`manifest.json`/`styles.css`); docs deploy on
push to `main`.

## Conventions (follow these)

- **Commits:** Conventional Commits, enforced by a commit-msg hook
  (`feat(scope): …`, `fix: …`, `docs: …`). Pre-commit runs `npm run lint`.
  **Do not add a `Co-Authored-By: Claude` (or any AI) trailer to commit messages.**
- **Branches:** work on `feature/*`; open PRs into `main`. Only commit/push when asked.
- **Imports:** bare-specifier aliases via `tsconfig` `baseUrl: src` — `architecture`, `config`,
  `actions`, `application`, `hooks`, `zettelkasten`, `starters`. No `paths` map.
- **Logging:** use `log` from `architecture`, never bare `console.*`.
- **Obsidian API:** go through the `ObsidianApi` facade / the `Vault` API; avoid global `app` and
  the `Adapter` API.
- **Vault writes:** go through `FileService` / `FrontmatterService` — never `vault.create`,
  `vault.modify`, `fileManager.renameFile` or `fileManager.processFrontMatter` directly. That is
  where the [write record](docs/architecture/reversibility.md) is taken, and a guardrail test
  (`vaultWriteSeam.test.ts`) fails the build on a direct call.
- **DOM:** build with `createEl`/`createDiv`/`createSpan`, clear with `el.empty()` —
  **never `innerHTML`**.
- **Styling:** CSS classes via `c('name')` (prefix `zettelkasten-flow__`) + SCSS partials in
  `src/styles/components/` — **never inline `el.style.*`**. And **the user's theme wins**
  ([constitution §XV](docs/development/constitution.md),
  [the guide](docs/development/obsidian-styling.md)): no hex or named colour in a stylesheet
  (`--interactive-*` / `--background-*` / `--text-*`), no pixel the 4-grid can express
  (`--size-4-*`), Obsidian's own classes (`mod-cta`, `clickable-icon`, `setting-item`, `is-active`)
  before a new one, and a shape that exists twice belongs in `src/styles/utils/mixins.scss`.
- **UI text:** **sentence case**, in the i18n layer (`architecture/lang/`); add keys to **both**
  `en.ts` and `es.ts`. A string with a **count** in it uses `tCount` and the `key` / `key_one`
  pair (#546 D2) — the status bar read *"1 gaps"* for a year. Two counts in one string is not
  supported on purpose: compose two phrases.
- **State:** Zustand only for the note-builder wizard; everything else is a `getInstance()`
  singleton.
- **Tests (TDD):** write a failing test first under `test/` (mirrors `src/`); `typecheck` +
  `oxlint` + `jest` are blocking via the `pre-push` hook and CI. See the `tdd` skill and
  [testing & guardrails](docs/development/testing-and-guardrails.md).

## Obsidian quality & scoring (important)

Since May 2026, Obsidian's Community hub runs an **automated review on every version** and
publishes a **1–100 quality score**. Changes should keep (and raise) that score. Before a
release, run the **`obsidian-plugin-quality`** skill; for PRs, use the
**`obsidian-plugin-reviewer`** agent. The rules and current compliance snapshot are in
[`docs/development/obsidian-review-and-scoring.md`](docs/development/obsidian-review-and-scoring.md).

## Known gaps (don't be surprised)

- **`versions.json` and `version-bump.mjs` are present** — `npm version <x.y.z>` bumps
  `manifest.json` and records the `version → minAppVersion` map. Current release line: `3.3.0`.
- **Tests are only seeded** — a jest + TDD harness now exists (pure-logic suites); breadth must
  grow (tracked by issues).
- `eslint-plugin-obsidianmd` is **clean and blocking** (was a 475-problem baseline; #85). All
  deferred best-practice migrations are now complete: AbstractInputSuggest (#111) and the
  declarative settings API (#112). No per-file relaxations remain.
- `innerHTML` and inline `el.style.*` assignments are fully migrated (0 remaining; enforced by
  the blocking Obsidian lint). Keep it that way — use `createEl`/`empty()` and `c('name')` classes.
- `log.error` always surfaces (wired in the Logger constructor), even before the logger is
  configured — errors are never silently swallowed.
- Canvas integration **monkey-patches** internal Obsidian APIs — fragile across app updates; keep
  patches defensive.

Full list + roadmap: [`docs/development/project-health-and-roadmap.md`](docs/development/project-health-and-roadmap.md).

## How we work: Spec-Driven Development (SDD)

Non-trivial changes are built **spec-first**: intent → spec in the **GitHub issue body** → plan
comment → tasks comment → code test-first → reviewed against the Obsidian score.

**Everything lives in GitHub Issues** — the spec is the issue body; the plan and task checklist
are issue comments. No local `specs/` directory.

The invariants are in [`docs/development/constitution.md`](docs/development/constitution.md) and the
narrative is [`docs/development/spec-driven-development.md`](docs/development/spec-driven-development.md).

```
constitution → /specify → /plan → /tasks → /implement → verify & review → Done
   invariants   issue body  comment  comment   code+tests   score audit + reviewer
```

| Stage | Skill | Owner agent | Produces |
|---|---|---|---|
| Specify | `specify` | `spec-author` | Issue body (spec) |
| Plan / Tasks | `plan`, `tasks` | `implementation-planner` | Issue comments (plan + task checklist) |
| Implement | `implement` (+ `tdd`) | main assistant | code, tests, commits |
| Verify & review | `obsidian-plugin-quality` | `obsidian-plugin-reviewer` | review findings |

A tiny, no-behavior change may skip to `/implement`; anything touching behavior, a public surface,
UI text, or the score runs the full flow. Start with the **`sdd`** skill for the map.

## Harness contents (`.claude/`)

This harness is committed (only `.claude/settings.local.json` is git-ignored). It provides:

- **Skills** (`.claude/skills/`):
  - `sdd` — the Spec-Driven Development pipeline map (start here for any non-trivial change).
  - `specify` / `plan` / `tasks` / `implement` — the four SDD stage workflows.
  - `obsidian-plugin-quality` — audit against the Obsidian review/score; use before release.
  - `tdd` — the test-first workflow (jest, alias mappings, the Obsidian mock).
  - `new-action` — scaffold a new action (the 4-file pattern + registration + docs).
  - `release` — the release checklist (version bump, `versions.json`, tag, artifacts).
- **Agents** (`.claude/agents/`):
  - `spec-author` — writes the spec into the GitHub issue body (SDD stage 1).
  - `implementation-planner` — posts the plan + task checklist as issue comments (SDD stages 2–3).
  - `obsidian-plugin-reviewer` — reviews a diff against the Obsidian guidelines and reports
    file-anchored findings (SDD stage 5).

## Working agreements

- **Cognitive agency (the meta-principle — see the [manifesto](docs/manifesto.md)).** ZettelFlow removes
  *mechanical* work and protects *cognitive* work. Mechanical output (a gathered list, a derived metric)
  writes freely; **interpretive** output (a conclusion, counterargument, synthesis, proposed connection —
  AI or heuristic) reaches the vault **only through an explicit human accept/modify/reject**, and the
  verdict is recorded. This is [constitution §XII](docs/development/constitution.md) and it is a review
  gate, not a preference.
- **Operational simplicity (a core principle — see the [manifesto](docs/manifesto.md)).** A capability
  is authorable **from the interface that owns it**, with working defaults; the `Setting` ships in the
  same change as the data field it writes. A feature whose only authoring path is hand-edited YAML is
  **not shippable**, however well documented — configuration files are an export format and an escape
  hatch, never the front door. This is
  [constitution §XIII](docs/development/constitution.md) and it is a review gate, not a preference.
- **Design by subtraction (a core principle — see the [manifesto](docs/manifesto.md)).** Prefer
  removing or centralizing over adding. If a new capability overlaps an existing one, **empower one**
  instead of shipping both; keep the product minimal and comprehensible. An addition must earn its
  place against the cost of complexity. When in doubt, subtract.
- Prefer editing existing patterns over inventing new ones — actions, settings handlers, and
  modals each have an established shape; match it.
- **Every change ships with a way to see it work ([constitution §XIV](docs/development/constitution.md)).**
  Every spec ends with a **`How to verify`** section: an automated *command → criteria proved* table,
  plus a numbered script a tester (or you) can walk in a real vault — preconditions, one observable
  expectation per step, the empty state, and the negative (nothing written, no layout change).
  Automate by default; a step that stays manual names its reason (WebGL scene · camera flight · view
  lifecycle · a real vault's shape). Finishing an implementation includes **walking the script** and
  fixing it where it drifted. Rules:
  [`.claude/skills/specify/references/verification.md`](.claude/skills/specify/references/verification.md).
- **Docs are a blocking exit criterion for every implementation.** When you finish a feature or
  fix, before committing, run a docs audit: does any page under `docs/` need to reflect the
  change? New feature → update or create a doc page. New action → `docs/actions/<Name>.md`.
  New config option → update the relevant architecture page. Changed behaviour → update the
  matching page. Pure refactor → confirm in the PR description that no doc change is needed. The
  `implement` skill exit step encodes the full checklist.
- When you change behavior or a public surface, update the matching page under `docs/` (and the
  `mkdocs.yml` nav) in the same change.
- **Surface important features in the README (adoption is a first-class goal).** If a change ships
  a feature a *user* would care about (a new command, view, action, or workflow — not an internal
  refactor), it must appear in the main `README.md` in the same change: add a row to the **Features**
  table, and for a headline capability also a bullet in the **Zettelkasten toolkit** section. The
  README is how new users decide to install — a shipped-but-unadvertised feature is a missed
  download. This is a blocking exit criterion (see the `implement` skill).
- **Every capability ships with a door of rank 1–3** ([capability doors](docs/development/capability-doors.md)).
  A control where you already are, a surface, or a line on Home — **not** a command. The palette is a
  hotkey and a re-entry point, never a discovery path (#496): *think before you look* was specified,
  built, documented, shipped, and then could not be found by the person who asked for it. Add the id
  to `CAPABILITIES` and TypeScript demands the rest; `capabilityDoors.test.ts` demands the door. And
  **a mode's header carries one primary action** — `ModeHeader.primary()` once, `nav()` for moving
  around inside the mode, `secondary()` for the overflow ([surfaces](docs/architecture/surfaces.md)).
- Don't introduce `innerHTML`, inline styles, or Title-case UI strings — they cost score.
- Keep the two locale files (`en.ts`/`es.ts`) in sync.
