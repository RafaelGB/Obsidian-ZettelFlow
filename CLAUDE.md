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
- `backend/` + `docker-compose.yml` — an **optional** FastAPI/MongoDB service for community
  templates.
- `docs/` + `mkdocs.yml` — the MkDocs Material site (GitHub Pages).

Current version: `2.12.0`, `minAppVersion 1.13.1`, desktop **and** mobile (`isDesktopOnly:false`).

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
 → actions/      11 built-in actions, each a 4-file bundle (Action/Component/Settings/SettingsReader)
 → application/  notes/ (NoteBuilder + ContentDTO + NoteDTO), components/noteBuilder (Zustand wizard), community/ (browser + backend client)
 → zettelkasten/ step/flow editor modals (StepBuilderModal, SelectorMenuModal, installed editors)
 → hooks/        vault hooks: folder automation + property hooks + context-menu integrations
```

Full detail: [`docs/architecture/overview.md`](docs/architecture/overview.md) and the pages it
links (plugin core, actions & note builder, vault hooks, community & backend).

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
| Obsidian-guideline lint (blocking) | `npm run lint:obsidian` — clean (0), part of `verify`/CI |
| Backend (optional) | `docker compose up --build` (needs a root `.env`) |
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
- **DOM:** build with `createEl`/`createDiv`/`createSpan`, clear with `el.empty()` —
  **never `innerHTML`**.
- **Styling:** CSS classes via `c('name')` (prefix `zettelkasten-flow__`) + SCSS partials in
  `src/styles/components/` — **never inline `el.style.*`**.
- **UI text:** **sentence case**, in the i18n layer (`architecture/lang/`); add keys to **both**
  `en.ts` and `es.ts`.
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
  `manifest.json` and records the `version → minAppVersion` map. Current release line: `2.12.0`.
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

- Prefer editing existing patterns over inventing new ones — actions, settings handlers, and
  modals each have an established shape; match it.
- **Docs are a blocking exit criterion for every implementation.** When you finish a feature or
  fix, before committing, run a docs audit: does any page under `docs/` need to reflect the
  change? New feature → update or create a doc page. New action → `docs/actions/<Name>.md`.
  New config option → update the relevant architecture page. Changed behaviour → update the
  matching page. Pure refactor → confirm in the PR description that no doc change is needed. The
  `implement` skill exit step encodes the full checklist.
- When you change behavior or a public surface, update the matching page under `docs/` (and the
  `mkdocs.yml` nav) in the same change.
- Don't introduce `innerHTML`, inline styles, or Title-case UI strings — they cost score.
- Keep the two locale files (`en.ts`/`es.ts`) in sync.
