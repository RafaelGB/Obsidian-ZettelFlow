# Architecture overview

> Developer-facing documentation. If you just want to *use* ZettelFlow, start at
> [Home](../index.md). This section explains how the plugin is built so you (or an AI
> assistant driving the [harness](../development/getting-started.md)) can extend it safely.

## The five layers (the organizing principle)

As of the Knowledge OS epic (#144), the codebase is understood as **five layers** (plus a
cross-cutting **Foundation**): **Knowledge Model** (the pure idea graph) → **Workflow Engine** (canvas
→ note) → **Knowledge State** (analyses over the model) → **Experience** (views, dashboards, Home) →
**Community Gallery** (sharing whole systems). Every capability has one home layer — the full
inventory is the [reposition map](reposition-map.md). The `src/` folders are being repositioned to
match, incrementally and without deleting or renaming any feature.

## What ZettelFlow is, technically

ZettelFlow is an **Obsidian plugin** that turns a native **Canvas** file into a directed
graph describing a *note-creation workflow*. When the user launches a flow, the plugin walks
that graph as a **wizard** (root → steps → actions), collects input, and generates a new note
by merging step-template files and running each step's **actions**.

It is a **monorepo** with two independent deliverables:

| Part | Path | Stack | Ships to |
|---|---|---|---|
| **The plugin** (the product) | `src/`, `manifest.json`, `esbuild.config.mjs` | TypeScript, React 19, Zustand 5, CodeMirror 6, esbuild + Dart Sass | Obsidian community directory (`dist/main.js`, `manifest.json`, `dist/styles.css`) |
| **Community backend** (optional) | `backend/`, `docker-compose.yml`, `containers/` | Python 3.11, FastAPI, Pydantic v2, MongoDB (hexagonal architecture) | A server the user points the plugin at |
| **Docs** (this site) | `docs/`, `mkdocs.yml` | MkDocs Material | GitHub Pages on push to `main` |

## Technology stack (plugin)

- **Language/build:** TypeScript (`target es2018`, `baseUrl: src` for bare-import aliases),
  bundled by **esbuild** (`src/main.ts → dist/main.js`, CJS). SCSS compiled by
  `esbuild-sass-plugin` (`src/styles/main.scss → dist/styles.css`). `tsc -noEmit` is a
  type-check gate only; esbuild is the real bundler.
- **UI:** **React 19** mounted into Obsidian modals/views via `createRoot`/`unmount`.
- **State:** **Zustand 5** — used *only* for the note-builder wizard
  (`useNoteBuilderStore`). Everything else is a hand-rolled `getInstance()` singleton.
- **Canvas integration:** **`monkey-around`** patches Obsidian's internal Canvas view to emit
  custom workspace events.
- **Editors:** **CodeMirror 6** for the `.js` script editor and the `{{frontmatter}}`
  live-preview extension.
- **Other:** `@dnd-kit/*` (sortable lists), `@popperjs/core`, `uuid` (v7), `tiny-jsonc` +
  `json-stable-stringify` (deterministic canvas serialization / lenient repair).

## Source layout (`src/`)

```
src/
├── main.ts                 # Plugin subclass; onload/onunload orchestration
├── starters/               # Bootstrap: ZComponents (ribbon, settings tab, API), {{frontmatter}} processors
├── config/                 # ZettelFlowSettings + DEFAULT_SETTINGS + settings-tab UI (3 sections)
├── architecture/           # The internal framework (see plugin-core.md)
│   ├── api/                #   ActionsStore, CustomZettelAction base, fnsManager (zf), ZfVault/ZfScripts
│   ├── knowledge/          #   Knowledge model: read-only idea index + query surface (see knowledge-model.md)
│   ├── plugin/             #   ObsidianApi facade, Lifecycle, canvas patcher + extensions, services, VaultStateManager
│   ├── components/         #   React/DOM primitives: core (CodeView, search), settings modals
│   ├── monitoring/         #   Logger + custom exceptions
│   ├── patterns/           #   AbstractChain (chain-of-responsibility)
│   ├── lang/               #   i18n (en/es), t()
│   └── styles/             #   c() class-name prefixer (zettelkasten-flow__)
├── actions/                # 11 built-in actions, each a 4-file bundle (see actions-and-note-builder.md)
├── application/            # Product logic
│   ├── notes/              #   NoteBuilder + NoteDTO + ContentDTO (the note-generation pipeline)
│   ├── components/         #   noteBuilder wizard (Zustand state machine), shared React components
│   └── community/          #   Community browser modals, galleries, HTTP client
├── zettelkasten/           # Step/flow editor modals (StepBuilderModal, SelectorMenuModal, installed editors)
├── hooks/                  # Vault hooks: folder automation + property hooks + context-menu integrations
└── styles/                 # SCSS (BEM-ish, prefixed .zettelkasten-flow__*)
```

## Import aliases

There is **no `paths` map**. `tsconfig.json` sets `baseUrl: "src"`, so every top-level folder
is importable as a bare specifier (and esbuild resolves the same way):

| Alias | Resolves to |
|---|---|
| `main` | `src/main.ts` |
| `config` | `src/config/` |
| `starters` | `src/starters/` |
| `architecture` (+ subpaths) | `src/architecture/` |
| `actions` | `src/actions/` |
| `application` (+ subpaths) | `src/application/` |
| `hooks` | `src/hooks/` |
| `zettelkasten` | `src/zettelkasten/` |
| `styles` | `src/styles/` |

## The big picture — how a note gets made

```
User triggers a flow (ribbon / command / folder-create hook / editor menu)
        │
        ▼
SelectorMenuModal  ──mounts──►  React wizard (useNoteBuilderStore)
        │
        ▼   walks the Canvas graph (Flow/FlowNode) as a state machine
RootSelector → (ElementSelector | ActionSelector)* → ProgressBar
        │                         │
        │                         └─ each action.hasUI renders a React step; user submits a value
        ▼
NoteBuilder.build()
   ├─ read chosen step-template .md files → ContentDTO (body + frontmatter)
   ├─ execute() every action → writes to ContentDTO (frontmatter / body {{key}} / context)
   ├─ FileService.createFile(finalPath, body)
   ├─ FrontmatterService.processTypedFrontMatter (typed YAML write)
   └─ postProcess() every action → side effects needing the TFile (e.g. backlinks) + Templater
        ▼
New note opens
```

Knowledge and relation actions increasingly operate on the **Knowledge Model via a typed
[`KnowledgeContext`](actions-and-note-builder.md#the-knowledgecontext-seam-xi-boundary) seam, not on a
`Note`** — a §XI-hardened boundary introduced by epic #262 Phase 2, so the same capability can run
during creation, review, or from any surface.

Two cross-cutting engines run alongside the wizard:

- **Canvas patcher** (`architecture/plugin/canvas`) — monkey-patches the Canvas view so the
  plugin can add "Edit step" / "Create managed step" menus and serialize canvas data
  deterministically.
- **Vault hooks** (`hooks/`) — react to vault/metadata events for **folder automation**
  (auto-launch a folder's flow on note create) and **property hooks** (run user JS when a
  frontmatter property changes).

## Where to read next

| You want to… | Read |
|---|---|
| Understand bootstrap, settings, ActionsStore, canvas patching, logging, i18n | [Plugin core](plugin-core.md) |
| Add or understand an action / how the note is assembled | [Actions & note builder](actions-and-note-builder.md) |
| Understand folder automation & property hooks | [Vault hooks internals](vault-hooks-internals.md) |
| Understand the community feature and the FastAPI backend | [Community & backend](community-and-backend.md) |
| Set up a dev environment and build/test/release | [Getting started](../development/getting-started.md) |
| Follow conventions / add a new action step by step | [Contributing & conventions](../development/contributing-and-conventions.md) |
| Understand the Obsidian score and how we maximise it | [Obsidian review & scoring](../development/obsidian-review-and-scoring.md) |
| See known gaps and the revival roadmap | [Project health & roadmap](../development/project-health-and-roadmap.md) |

## Glossary

- **Flow** — a `.canvas` file interpreted as a workflow graph.
- **Node / Step** — a canvas node (`text` / `file` / `group` / `link` / `javascript`) carrying
  a `StepSettings` config (stored as `zettelflowConfig`).
- **Root** — a node eligible to start a flow (not a `.js` file).
- **Action** — a unit attached to a step that contributes to the generated note (11 built-in
  types). Has a design-time config UI and an optional build-time wizard UI.
- **Zone** — where an action's value lands: `frontmatter`, `body` (`{{key}}` substitution), or
  `context` (ephemeral, shared between actions/scripts).
- **`zf`** — the scripting API object injected into Script actions and property hooks
  (`{ external: { tp, dv }, internal: { vault, user } }`).
