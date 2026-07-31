---
name: new-action
description: Scaffold a new ZettelFlow action following the project's 4-file convention (Action / Component / Settings / SettingsReader), register it, and document it. Use when the user asks to "add an action", "create a new action type", "scaffold an action", or wants to extend the note builder with a new interactive step.
---

# Add a new ZettelFlow action

An **action** is a unit attached to a canvas step that contributes to the generated note. Each
action is a 4-file bundle in `src/actions/<name>/` plus one registration line. Read
[`docs/architecture/actions-and-note-builder.md`](../../../docs/architecture/actions-and-note-builder.md)
for the full contract before starting; this skill is the mechanical recipe.

## Decide the shape first

Ask (or infer) three things:

1. **Interactive or background?** `hasUI: true` renders a wizard step (with a `Component`);
   `hasUI: false` runs silently during build (no `Component`), like `script`/`task-management`.
2. **Where does the value land?** A `zone` — `frontmatter` (YAML property), `body` (`{{key}}`
   substitution), or `context` (ephemeral, shared between actions). Most value-producing actions
   expose a `zone` + `key` config.
3. **Does it need the real file?** If it must touch a `TFile` *after* the note is written (like
   `backlink`), implement `postProcess` instead of / in addition to `execute`.

Copy the closest existing action as a template: **`prompt`** (simple UI + zone/key/static),
**`selector`** (options list), **`script`** (background, imperative), **`backlink`**
(`postProcess`).

## The 4 files

Create `src/actions/<name>/`:

### 1. `<Name>Action.tsx` — the class

```tsx
import { CustomZettelAction } from "architecture/api";
// ...
export class <Name>Action extends CustomZettelAction {
  id = "<type-id>";                       // unique; becomes Action.type
  defaultAction = { type: this.id, id: this.id, hasUI: true, zone: "frontmatter" };
  settings = <name>Settings;              // from <Name>Settings
  settingsReader = <name>SettingsReader;  // from <Name>SettingsReader
  link = "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/<Name>/";
  purpose = "One-line description shown in the action picker.";

  component(props) { return <<Name>Wrapper {...props} />; }   // only if hasUI

  async execute(info) {
    const { key, zone } = info.element;              // config
    const value = info.element.result;               // user input (or static value)
    switch (zone) {
      case "body":    info.content.modify(key, value); break;
      case "context": info.context[key] = value; break;
      default:        info.content.addFrontMatter({ [key]: value });
    }
  }

  getIcon() { return "<lucide-icon-id>"; }
  getLabel() { return "<sentence case label>"; }
}
```

### 2. `<Name>Component.tsx` — build-time UI (skip if `hasUI: false`)

A React component that collects input and submits via `props.callback(value)` (see
`PromptComponent` for the Enter-to-submit pattern). Style with the `c('...')` helper.

### 3. `<Name>Settings.ts(x)` — design-time config UI

Render Obsidian `Setting` rows (and/or a React root) that mutate the `action` object: the zone
dropdown, `key` (with `PropertySuggest`), label/placeholder, and — for value actions — a
**static toggle** that sets `hasUI=false` + a fixed `staticValue`. Mirror `PromptSettings`.

### 4. `<Name>SettingsReader.ts` — read-only config view

Render the config non-editably (used in community previews). Usually reuses the same detail
renderer as `Settings` in read-only mode.

## Register it

1. Export the class from `src/actions/index.ts`.
2. Add `actionsStore.registerAction(new <Name>Action());` to `registerActions()` in
   `src/main.ts`.

## Document it

1. Add `docs/actions/<Name>.md` (follow an existing action page).
2. Add it to the `mkdocs.yml` nav under `2. Actions`.

## Verify

- `npm run release` (type-check + build) passes.
- `npm run lint` is clean.
- The label and any UI text are **sentence case** and, ideally, come from the i18n layer
  (`architecture/lang/` — add keys to `en.ts` and `es.ts`).
- No `innerHTML` and no inline `el.style.*` (use `c()` + SCSS). These cost Obsidian score — see
  the `obsidian-plugin-quality` skill.
- Add the new action to the table in `docs/architecture/actions-and-note-builder.md`.
