# Getting started (development)

How to set up, build, run, and iterate on ZettelFlow.

## Prerequisites

- **Node.js** (CI uses Node 23; any recent LTS ≥ 18 works locally).
- **npm** (the repo ships a lockfile-friendly `package.json`).
- An **Obsidian vault** for testing. The plugin targets `minAppVersion 1.4.11`.
- *(Optional)* **Docker + Docker Compose** for the community backend (`backend/`).

## Install

```bash
npm install
```

Husky installs git hooks on `npm install` (via the `prepare` script): a **pre-commit** hook
runs `npm run lint`, and a **commit-msg** hook enforces Conventional Commits.

## Build & watch

| Task | Command | What it does |
|---|---|---|
| Dev build + watch | `npm run dev` | `node esbuild.config.mjs` — inline sourcemaps, no minify, watches `src/**` (JS) and `src/styles/**` (SCSS). Stays running. |
| Production build | `npm run release` | `tsc -noEmit -skipLibCheck` (type-check gate) then `node esbuild.config.mjs production` — minified one-shot build to `dist/`. |
| Lint | `npm run lint` / `npm run lint:fix` | `oxlint ./src` (also runs on pre-commit). |
| Test | `npm test` | `jest` — ⚠️ **no tests or jest config exist yet** (see [Project health](project-health-and-roadmap.md)). |

Build outputs (`dist/main.js`, `dist/styles.css`) are git-ignored.

### Loading the dev build into Obsidian

esbuild writes to `dist/`, but Obsidian loads a plugin from
`<vault>/.obsidian/plugins/zettelflow/` and expects `main.js`, `manifest.json`, `styles.css`
**at the plugin root**. Two common approaches:

1. **Symlink the vault plugin folder** to this repo and adjust the esbuild `outfile` to emit at
   the repo root (or symlink `dist/main.js`, `manifest.json`, `dist/styles.css` into the plugin
   folder).
2. **Develop directly inside a test vault**: clone the repo into
   `<vault>/.obsidian/plugins/zettelflow/`, run `npm run dev`, and point the esbuild `outfile`
   at the root.

Then enable the plugin in Obsidian and use **Reload app** (or a hot-reload plugin) after builds.

> The current `esbuild.config.mjs` emits to `dist/`. If you want the output at the repo root for
> a symlinked vault, change `outfile: "dist/main.js"` → `"main.js"` and
> `outfile: "dist/styles.css"` → `"styles.css"` locally (don't commit that change unless the
> release workflow is updated to match).

## Project layout & import aliases

See [Architecture overview](../architecture/overview.md) for the full `src/` map. The important
thing for day-to-day work: `tsconfig.json` sets `baseUrl: "src"`, so you import top-level
folders as **bare specifiers** (`import { log } from "architecture"`,
`import { DEFAULT_SETTINGS } from "config"`), and esbuild resolves them the same way. There is no
`paths` map to maintain.

## Running the community backend (optional)

```bash
# from repo root, with a .env providing MONGO_INITDB_ROOT_USERNAME / _PASSWORD / _DATABASE
docker compose up --build
```

This starts MongoDB (`:27017`) and the FastAPI app (`:8000`, hot-reload). Point the plugin at it
via **Settings → Developer → community URL** (default `http://127.0.0.1:8000`) and set a token to
switch the community browser to the dynamic source. See
[Community & backend](../architecture/community-and-backend.md).

## Building the docs site

The docs you are reading are MkDocs Material:

```bash
pip install -r docs/requirements.txt
mkdocs serve       # live preview at http://127.0.0.1:8000
```

Pushing to `main` triggers `.github/workflows/documentation.yml`, which deploys the site to
GitHub Pages.

## Working with the AI harness

This repo ships a Claude Code **harness** ([`CLAUDE.md`](../../CLAUDE.md) + `.claude/`). It gives
an assistant the architecture map, conventions, and Obsidian-specific skills:

- **Skill `obsidian-plugin-quality`** — audits the code against the Obsidian review/score.
- **Skill `new-action`** — scaffolds a new action (the 4-file pattern + registration).
- **Skill `release`** — the release checklist.
- **Agent `obsidian-plugin-reviewer`** — reviews a diff against the Obsidian guidelines.

See [Contributing & conventions](contributing-and-conventions.md) for how they fit the workflow.
