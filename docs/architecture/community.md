# Community gallery (static)

ZettelFlow lets users **browse, preview, install and reuse** shareable building blocks —
*actions*, *steps*, *markdown* notes, and complete *systems*. The gallery is **fully
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
difficulty? }`, where `template_type ∈ step | action | markdown | system`. `ref` is a repo-relative
path:

| `template_type` | `ref` resolves to | Fetched as |
|---|---|---|
| **system** | `/docs/systems/<name>.zftemplate` (+ optional sibling `<name>.png`) | parsed `.zftemplate` |
| **step / action** | `/docs/steps/community/*.json` | JSON |
| **markdown** | `/docs/steps/markdown/*.md` | text/plain |

## 2. Frontend module — `src/application/community/`

### Modals

- **`CommunityTemplatesModal`** — the Hub shell (#294): tabs the static gallery (Browse), the
  Contribute and Learn panels, and Installed management. Browse (`StaticTemplatesGallery`) leads with
  systems, searches title/description/**author**, filters by type **and difficulty** (easy/medium/hard),
  and each card links to the author's GitHub profile and to the source file in the repo.
- **`CommunityActionModal`** — preview of a single action (icon/label + rendered markdown
  description + `settingsReader`). Install toggles `settings.installedTemplates.actions[id]`.
- **`CommunityStepModal`** — preview of a step (metadata + each action via `settingsReader`);
  Install/Remove (with a confirm dialog) writes `installedTemplates.steps[id]`; "Manage" opens
  `InstalledStepEditorModal`.
- **`CommunityMarkdownModal`** — preview of a markdown template; Download writes the note into
  `communitySettings.markdownTemplateFolder` (Remove deletes it).
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
| `fetchSystemTemplate(ref)` | `${BASE}${ref}` | `ZfTemplate` (parsed `.zftemplate`) |
| `fetchMarkdownTemplate(ref)` | `${BASE}${ref}` | raw markdown |

### How templates are imported

- **Steps / Actions** — "install" serializes the object into
  `settings.installedTemplates.steps|actions[id]`. No files are written; installed steps later
  become canvas nodes (`node.unknownData.zettelflowConfig`) or are edited via
  `InstalledStepEditorModal`.
- **Markdown** — written as a real note into `markdownTemplateFolder`.
- **Systems** (#214) — the modern one-click path. `planSystemInstall` turns a `.zftemplate` into a
  deterministic file list (canvas + steps under the chosen folder); the modal writes each with
  `FileService.writeFile` and opens the canvas.

## 3. Contributing to the gallery

Because the catalog is just files in the repo, **all contribution flows through GitHub** — there is
nothing to POST to. The Hub's **Contribute** tab (#294) opens the right prefilled GitHub flow from
inside Obsidian:

- **Share your system** — exports the active canvas to a `.zftemplate` and opens the
  [Add a template](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/new?template=ADD_TEMPLATE.yaml)
  issue form with the bundle prefilled (or, if the bundle is too large for the URL, downloads the
  `.zftemplate` and opens the form with a paste hint).
- **Suggest an idea** / **Report a bug** — open the feature-request / bug-report forms (the bug form
  arrives with your plugin version, Obsidian version and platform filled in).
- **Ask or discuss** — opens GitHub Discussions.

A maintainer then adds the `.zftemplate` under `docs/systems/` and a row in `docs/main_template.json`
on `main`. See the [Systems Gallery guide](../how-to-contribute/systems-gallery.md) for authoring
details, and [Community examples](../how-to-contribute/community-examples.md) for the
step/action/markdown formats.
