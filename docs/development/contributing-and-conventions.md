# Contributing & conventions

## Commit convention — Conventional Commits

Enforced by a `commit-msg` husky hook (`commitlint` + `@commitlint/config-conventional`).
Format:

```
<type>(<optional scope>): <subject>
```

Common types: `feat`, `fix`, `docs`, `refactor`, `style`, `test`, `chore`, `ci`, `build`.
Examples from history: `feat(clipboard): option to copy paste actions between steps`,
`feat(types): ux improved`. Keep the subject imperative and lower-case.

## Branching & releases

- Work on `feature/*` branches; merge into `main`.
- Pushing to `main` deploys the **docs**.
- Pushing a **git tag** triggers `releases.yml`, which builds and uploads `main.js`,
  `manifest.json`, `styles.css` to a GitHub Release. The tag drives the release; keep it equal to
  `manifest.version`. See the [release checklist](#release-checklist).

## Code style

- **TypeScript** with `strictNullChecks`, `noImplicitAny`, `noUnusedLocals` (see `tsconfig.json`).
  `tsc -noEmit` must pass (it's the release gate).
- **Linting** is `oxlint ./src`. For Obsidian-guideline compliance, additionally run the official
  `eslint-plugin-obsidianmd` (see [scoring](obsidian-review-and-scoring.md)).
- **Imports** use the bare-specifier aliases (`architecture`, `config`, `actions`, …).
- **Logging** goes through `log` from `architecture` (never bare `console.*`).
- **Obsidian API** access goes through the `ObsidianApi` facade / the `Vault` API — avoid
  touching `app` globally and avoid the `Adapter` API.
- **DOM** is built with `createEl`/`createDiv`/`createSpan`; clear with `el.empty()` — never
  `innerHTML`.
- **Styling** uses CSS classes via the `c('name')` helper (prefix `zettelkasten-flow__`) and SCSS
  partials under `src/styles/components/` — never inline `el.style.*`.
- **UI text** is **sentence case** and lives in the i18n layer (`architecture/lang/`); add keys
  to both `en.ts` and `es.ts`.

## Styling architecture

`src/styles/main.scss` is a Dart-Sass aggregator (`@use`): `utils/` (variables, animations,
mixins) → `libraries/` (dragAndDrop) → `components/` (14 partials) → a few global base rules.
Every class is `zettelkasten-flow__<name>`; the runtime helper `c(...)`
(`architecture/styles/helper.ts`, `CSS_PREFIX = 'zettelkasten-flow'`) and the SCSS selectors must
stay in sync. Consume Obsidian CSS variables (`--background-*`, `--interactive-accent`, `--text-*`)
plus the local `--zf-*` custom props.

## Adding a new action

An action is a 4-file bundle in `src/actions/<name>/` plus one registration line. Use the
`new-action` harness skill to scaffold it, or do it by hand:

1. **`<Name>Action.tsx`** — a `CustomZettelAction` subclass. Set `id`, `defaultAction`
   (`{ type, id, hasUI, ... }`), `getIcon()`, `getLabel()`, `link`, `purpose`, and implement
   `execute(info)` (write to `info.content` / `info.context` by `zone`) and/or
   `postProcess(info, file)`.
2. **`<Name>Component.tsx`** — the build-time React UI (only if `hasUI: true`); call
   `props.callback(value)` to submit the user's value.
3. **`<Name>Settings.ts(x)`** — the design-time config UI (Obsidian `Setting` rows and/or React).
   Follow an existing action (e.g. `prompt`) for the zone/key/label/static pattern.
4. **`<Name>SettingsReader.ts`** — the read-only config view (used in community previews).
5. **Register it** in `src/main.ts → registerActions()` and export the class from
   `src/actions/index.ts`.
6. **Document it** under `docs/actions/<Name>.md` and add it to the `mkdocs.yml` nav.

See [Actions & note builder](../architecture/actions-and-note-builder.md) for the full contract,
the zone model, and the DTOs your `execute` writes into.

## Adding a settings section or handler

Settings sections are chain-of-responsibility handlers (`AbstractChain<SettingsHandlerInfo>`).
Add a handler under `src/config/modals/handlers/` and wire it into the relevant section's chain
(General / Hooks / Developer). React-based handlers mount with `createRoot` and unmount on
`refresh`.

## Pull-request checklist

- [ ] `npm run release` passes (type-check + build).
- [ ] `npm run lint` is clean; ideally `eslint-plugin-obsidianmd` too.
- [ ] New UI strings are sentence case and in `en.ts` + `es.ts`.
- [ ] No `innerHTML` / inline styles introduced.
- [ ] Docs updated (`docs/…` + `mkdocs.yml` nav) if behavior or API changed.
- [ ] Commit messages follow Conventional Commits.

## Release checklist

See the `release` harness skill for the automated version. In short:

1. Bump `manifest.json` `version` (and `manifest-beta.json` if used); ensure `minAppVersion` is
   correct.
2. Update / create **`versions.json`** mapping the new version → its `minAppVersion`.
   *(Currently missing — restore `version-bump.mjs` to automate this. See
   [Project health](project-health-and-roadmap.md).)*
3. `npm run release` and verify `dist/main.js` + `dist/styles.css` build.
4. Commit, then **tag** with the exact version (no `v` prefix) and push the tag — `releases.yml`
   creates the GitHub Release with the three artifacts.
5. Confirm the release passes Obsidian's automated review
   ([scoring](obsidian-review-and-scoring.md)).
