# Getting started (development)

How to set up, build, run, and iterate on ZettelFlow.

## Prerequisites

- **Node.js** (CI uses Node 23; any recent LTS ≥ 18 works locally).
- **npm** (the repo ships a lockfile-friendly `package.json`).
- An **Obsidian vault** for testing. The plugin targets `minAppVersion 1.13.1`.

## Install

```bash
git clone https://github.com/RafaelGB/Obsidian-ZettelFlow.git
cd Obsidian-ZettelFlow
npm install
```

`npm install` runs the `prepare` script, which installs Husky git hooks:
- **pre-commit** — runs `npm run lint` (oxlint).
- **pre-push** — runs `npm run verify` (typecheck + lint + obsidian lint + jest).
- **commit-msg** — enforces [Conventional Commits](contributing-and-conventions.md).

## Build commands

| Task | Command |
|---|---|
| Dev build + watch | `npm run dev` |
| Dev build + watch + deploy to vault | `npm run dev:vault` (requires `.vault-path`) |
| One-shot deploy to vault | `npm run deploy:vault` (requires `.vault-path`) |
| Production build (type-check + minify) | `npm run release` |
| Lint | `npm run lint` / `npm run lint:fix` |
| Type-check | `npm run typecheck` |
| Tests (TDD) | `npm test` / `npm run test:watch` / `npm run test:coverage` |
| Full verify (CI equivalent) | `npm run verify` |
| Obsidian guideline lint | `npm run lint:obsidian` |

Build outputs (`dist/main.js`, `dist/styles.css`) are git-ignored.

## Loading the dev build into Obsidian

The easiest approach is the `.vault-path` file:

1. Create a file named `.vault-path` at the repo root containing the absolute path to your test vault:
   ```
   C:\Users\you\Documents\MyVault
   ```
2. Run `npm run dev:vault`. esbuild writes `main.js`, `manifest.json`, and `styles.css` directly into `<vault>/.obsidian/plugins/zettelflow/` and watches for changes.
3. Enable the plugin in Obsidian. After each rebuild, use *Reload app without saving* (Ctrl/Cmd+R) or the [Hot Reload](https://github.com/pjeby/hot-reload) community plugin.

Alternatively, clone the repo directly into `<vault>/.obsidian/plugins/zettelflow/` and run `npm run dev` (esbuild emits to `dist/`; you'd need to symlink or copy the output files).

## Project layout & import aliases

See [Architecture overview](../architecture/overview.md) for the full `src/` map.

`tsconfig.json` sets `baseUrl: "src"`, so top-level source folders are bare-specifier imports:

```ts
import { log } from "architecture";          // src/architecture/index.ts
import { DEFAULT_SETTINGS } from "config";   // src/config/index.ts
import { StepBuilderModal } from "zettelkasten"; // src/zettelkasten/index.ts
```

No `paths` map to maintain — esbuild resolves them the same way TypeScript does.

## Testing

The project uses Jest with a custom `moduleNameMapper` that mirrors the `baseUrl` aliases. Tests live under `test/` mirroring the `src/` directory layout.

```bash
npm test               # run all tests
npm run test:watch     # watch mode
npm run test:coverage  # coverage report
```

When adding a feature, write tests first (TDD). See the [`tdd` skill](../../.claude/skills/) and [Testing & guardrails](testing-and-guardrails.md) for the full workflow.

## Community gallery

Nothing to run — the community gallery is [fully static](../architecture/community.md): it reads the
catalog `docs/main_template.json` and its payloads from GitHub raw. Contributions go through GitHub
(the [Add a template](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/new?template=ADD_TEMPLATE.yaml)
issue form + a PR under `docs/`).

## Docs site

```bash
pip install -r docs/requirements.txt
mkdocs serve    # live preview at http://127.0.0.1:8000
```

Pushing to `main` triggers `.github/workflows/documentation.yml` which deploys to GitHub Pages.

## AI harness (Claude Code)

The repo ships a Claude Code harness (`CLAUDE.md` + `.claude/`). It encodes the architecture, conventions, and Obsidian-specific skills. See [Spec-driven development](spec-driven-development.md) for the full SDD pipeline and [Contributing & conventions](contributing-and-conventions.md) for how skills fit the day-to-day workflow.
