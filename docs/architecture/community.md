# Community gallery (static)

ZettelFlow lets users **browse, preview, install and reuse** shareable building blocks —
*actions*, *steps*, *markdown* notes, and complete *systems*. The gallery is **fully
static**: it reads a catalog and its payloads straight from the repo over GitHub raw. There is **no
backend** to run — no server, no database, no accounts, no network writes from the plugin.

## 1. One data source — the static catalog

### Installation without overwriting customizations (#401)

The existing system installer preflights every planned destination. Exact unchanged files are reused;
different/customized content blocks the install before new writes. Races and I/O failures can still
leave a partial installation: retry in the same folder to verify completed files and create only
missing ones. No automatic overwrite, deletion or claim of an atomic multi-file transaction. Busy
submissions are ignored, code acknowledgement is preserved, and Run now is offered only after all
files are verified. For a deliberately different system version, choose a new folder.

The tour stays optional and uses its three existing entry points. Its description guides users back
to Home's own-material inquiry with their resulting note. Installed/customized copies are never
silently upgraded. Direct purpose-led use needs no gallery download or system installation.

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
| **system** | `/docs/systems/<name>.zftemplate` (+ sibling preview `<name>.svg`, and `<name>.png` rendered from it for older releases) | parsed `.zftemplate` |
| **step / action** | `/docs/steps/community/*.json` | JSON |
| **markdown** | `/docs/steps/markdown/*.md` | text/plain |

## 2. Frontend module — `src/application/community/`

### Community is a view (#798)

Community is an `ItemView` in the main area (`view/CommunityView.ts`, type `zettelflow-community`),
not a modal. It holds four **rooms**, side by side in this order: **Learn · Systems · Contribute ·
Installed**. A tablist (`view/roomNav.ts`) switches between them, and switching is a camera **pan**
(`view/communityPan.ts`): the room strip moves by one Web Animations `transform` on the shared motion
tokens, and the nav indicator slides in the same gesture. Only the rooms the camera passes are
painted. Any key or click jumps the pan to its end, a timeout settles it even if the animation never
reports that it finished, and under reduced motion the pan is a cut. Rooms out of view are `inert`.

- **The room is view state.** `getState()` returns `{ room }`, so the room survives a workspace
  reload and an opener can deep-link to a room. An unknown room falls back to Learn.
- **One leaf.** Every entry point calls `openCommunity(app, room?)` (`view/openCommunity.ts`). It
  reveals the Community leaf if one is open and pans it to the room. Otherwise it opens one new tab.

  | Entry point | Room |
  |---|---|
  | Ribbon menu → *Community* (command `open-community`) | the last room used in this vault; Learn the first time |
  | Settings → Flows → *Community systems* · the settings start card · welcome · wizard and canvas empty states | Systems |
  | Settings → Flows → *Manage installed templates* | Installed |
  | Commands `browse-systems` and `open-community-templates` (kept as aliases, §XI) | Systems |
  | Command `open-manage-templates` | Installed |

- **A navigation view.** The view sets `navigation = true`, because later slices open a canvas in
  this same leaf and Obsidian's *Back* has to return to Community. The consequence, checked in
  Obsidian 1.14.4: a file opened while the Community tab is active opens in that tab, as it would
  over a note, and *Back* brings Community back at the room it was on.
- **The last room** is kept per vault in Obsidian's local storage (`ObsidianApi.loadLocal` /
  `saveLocal`, key `zettelflow-community-room`), never in `data.json`. Choosing a room writes nothing
  else.
- **The rooms' contents.** Each room is a `RoomRenderer` (`view/communityRoomHost.ts`). For now every
  room re-hosts the panel the old modal had (`view/legacyRooms.tsx`): Learn (`LearnTab`), Systems
  (`StaticTemplatesGallery`), Contribute (`ContributeTab`) and Installed
  (`InstalledTemplatesManagement`, with the *Add the template from the clipboard* button the
  manage-installed modal used to carry). Later slices of epic #797 replace them one room at a time.
- **Systems** (`StaticTemplatesGallery`) leads with systems, searches title/description/**author**,
  filters by type **and difficulty** (easy/medium/hard), and each card links to the author's GitHub
  profile and to the source file in the repo.

### Modals
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
nothing to POST to. Community's **Contribute** room (#294, #798) opens the right prefilled GitHub flow from
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

## Installing a system into a role (#437)

Installing used to write the files, open the canvas and offer a *run now* command. The system was
in your vault and connected to nothing: the ribbon did not open it, no folder ran it, and you had
to know — from nowhere — that it needed wiring by hand in settings.

The last question of the install dialog is now **how will you use this?**

| Answer | What it writes | How it runs afterwards |
|---|---|---|
| Creates notes | the *new notes canvas* setting | the ribbon icon |
| Edits the open note | the *editor canvas* setting | the edit command, at your cursor |
| Runs on a folder | the canvas, **named after the folder** you pick | creating a note there |
| Runs on an event | the canvas, in the events folder | give its first step a trigger |
| Just the files | nothing | the *run a flow* command (what it always did) |

Three rules keep it honest:

- **Nothing is written before you agree.** The confirmation names the folder the files go to, the
  canvas that would stop holding an exclusive role (it keeps existing as a file), and how the
  system will run. Cancelling writes nothing — not even the files.
- **No destructive default.** *Creates notes* is pre-selected only when no canvas holds that role
  yet, which is the common first install and displaces nobody. Otherwise the dialog starts at
  *just the files*.
- **The success notice says how it runs**, in those words, instead of naming a command.

Everything else is unchanged: still create-only and idempotent (`createFilesOnce`), still validated
before install, still one static fetch from GitHub raw — no backend (#294).
