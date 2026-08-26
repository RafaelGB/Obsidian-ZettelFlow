# Community gallery (static)

ZettelFlow lets users **browse, preview, install and reuse** shareable building blocks —
*actions*, *steps*, *markdown* notes, whole *flows*, and complete *systems*. The gallery is **fully
static**: it reads a catalog and its payloads straight from the repo over GitHub raw. There is **no
backend** to run — no server, no database, no accounts, no network writes from the plugin.

## 1. One data source — the static catalog

The browser reads a single catalog, `docs/main_template.json`, from GitHub raw and resolves each
entry's `ref` against the same base. Everything is offline-friendly (a plain `GET`) and versioned
with the repo.

```ts
COMMUNITY_BASE_URL = "https://raw.githubusercontent.com/RafaelGB/Obsidian-ZettelFlow/refs/heads/main";
// StaticTemplatesGallery → fetchCommunityTemplates() → GET ${BASE}/docs/main_template.json
```

Each catalog row is a `StaticTemplateOptions`: `{ id, template_type, ref, title, description, author,
difficulty? }`, where `template_type ∈ step | action | markdown | flow | system` (legacy `flow`
entries are kept for back-compat but hidden from the browser). `ref` is a repo-relative path:

| `template_type` | `ref` resolves to | Fetched as |
|---|---|---|
| **system** | `/docs/systems/<name>.zftemplate` (+ optional sibling `<name>.png`) | parsed `.zftemplate` |
| **step / action** | `/docs/steps/community/*.json` | JSON |
| **markdown** | `/docs/steps/markdown/*.md` | text/plain |
| **flow** *(legacy)* | `/docs/flows/<name>/flow.json` | JSON |

## 2. Frontend module — `src/application/community/`

### Modals

- **`CommunityTemplatesModal`** — shell; renders a navbar (with an "Add template" link to a GitHub
  issue form) and mounts the static gallery.
- **`CommunityActionModal`** — preview of a single action (icon/label + rendered markdown
  description + `settingsReader`). Install toggles `settings.installedTemplates.actions[id]`.
- **`CommunityStepModal`** — preview of a step (metadata + each action via `settingsReader`);
  Install/Remove (with a confirm dialog) writes `installedTemplates.steps[id]`; "Manage" opens
  `InstalledStepEditorModal`.
- **`CommunityMarkdownModal`** — preview of a markdown template; Download writes the note into
  `communitySettings.markdownTemplateFolder` (Remove deletes it).
- **`CommunityFlowModal`** *(legacy)* — previews a whole flow (fetches `image.png`), "Copy to
  clipboard" (stores the flow in `communitySettings.clipboardTemplate`), "Download flow files"
  (writes referenced markdown into the vault and rewrites node `file` paths).
- **`CommunitySystemModal`** (#214) — previews a whole **system** shipped as the unified
  [`.zftemplate`](zftemplate-schema.md) bundle: name, author, description, an optional sibling
  preview image, and the list of files that will be written. "Install system" picks a target folder
  (default `foldersFlowsPath`), then `planSystemInstall` + `FileService.writeFile` create the canvas
  and every step note in one click (no clipboard, no manual paste) and open the canvas. The pure
  planner/validator lives in `systemInstall.ts` (Obsidian-free, so it is unit-testable and every
  shipped system is checked against the registered action ids).
- **`ManageInstalledTemplatesModal`** — manages installed templates; "Add template from clipboard"
  imports `clipboardTemplate` into `installedTemplates`.
- **`UsedInstalledStepsModal`** — a picker (`StepTemplatesSelector`) used to drop an installed step
  onto a canvas node.

### HTTP client — `services/CommunityHttpClientService.ts`

GET-only, against the GitHub-raw base (uses Obsidian's `request()`):

| Function | URL | Returns |
|---|---|---|
| `fetchCommunityTemplates()` | `${BASE}/docs/main_template.json` | `StaticTemplateOptions[]` |
| `fetchActionTemplate(ref)` | `${BASE}${ref}` | `CommunityAction` |
| `fetchStepTemplate(ref)` | `${BASE}${ref}` | `CommunityStepSettings` |
| `fetchFlowTemplate(ref)` | `${BASE}${ref}/flow.json` | `CommunityFlowData` |
| `fetchSystemTemplate(ref)` | `${BASE}${ref}` | `ZfTemplate` (parsed `.zftemplate`) |
| `fetchMarkdownTemplate(ref)` | `${BASE}${ref}` | raw markdown |

### How templates are imported

- **Steps / Actions** — "install" serializes the object into
  `settings.installedTemplates.steps|actions[id]`. No files are written; installed steps later
  become canvas nodes (`node.unknownData.zettelflowConfig`) or are edited via
  `InstalledStepEditorModal`.
- **Markdown** — written as a real note into `markdownTemplateFolder`.
- **Flows** *(legacy)* — "Copy to clipboard" → `clipboardTemplate`; "Download flow files" writes
  the markdown and rewrites node paths; imported via `ManageInstalledTemplatesModal`.
- **Systems** (#214) — the modern one-click path. `planSystemInstall` turns a `.zftemplate` into a
  deterministic file list (canvas + steps under the chosen folder); the modal writes each with
  `FileService.writeFile` and opens the canvas.

## 3. Contributing to the gallery

Because the catalog is just files in the repo, **all contribution flows through GitHub** — there is
nothing to POST to. To add a system, open the **[Add a template](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/new?template=ADD_TEMPLATE.yaml)**
issue form; a maintainer adds the `.zftemplate` under `docs/systems/` and a row in
`docs/main_template.json` on `main`. See the [Systems Gallery guide](../how-to-contribute/systems-gallery.md)
for authoring details, and [Community examples](../how-to-contribute/community-examples.md) for the
step/action/markdown formats.
