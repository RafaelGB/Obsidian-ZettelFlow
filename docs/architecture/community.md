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
// the Systems room → fetchCommunityTemplates() → GET ${BASE}/docs/main_template.json
```

Each catalog row is a `StaticTemplateOptions`: `{ id, template_type, ref, title, description, author,
difficulty?, summary?, steps?, branches? }`, where `template_type ∈ step | action | markdown | system`.
The three last fields are for systems (#799): `summary` is one line per language (`{ en, es }`; a
system without one shows its description's first sentence), and `steps` / `branches` are what its
canvas draws, so the room can group systems before it fetches a single template. `catalog.test.ts`
checks both counts against each shipped canvas. Older releases ignore all three. `ref` is a
repo-relative path:

| `template_type` | `ref` resolves to | Fetched as |
|---|---|---|
| **system** | `/docs/systems/<name>.zftemplate` (+ sibling preview `<name>.svg` and `<name>.png`, kept for older releases: the room draws the canvas itself) | parsed `.zftemplate` |
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
- **The rooms' contents.** Each room is a `RoomRenderer` (`view/communityRoomHost.ts`). Systems is
  native (#799, below). The others still re-host the panel the old modal had
  (`view/legacyRooms.tsx`): Learn (`LearnTab`), Contribute (`ContributeTab`) and Installed
  (`InstalledTemplatesManagement`, with the *Add the template from the clipboard* button the
  manage-installed modal used to carry). Later slices of epic #797 replace them one room at a time.
  A room's handle may add to the view's state (`viewState` / `applyState`) and take Esc
  (`onEscape`).

### The Systems room (#799)

The whole adoption path, in one shot, in `view/systemsRoom.ts` (native DOM; no React):

- **The room.** Systems in two groups, in catalog order: **A whole method** (more than one step)
  and **One note, done well** (`systemsCatalog.groupSystems`). Each card is a **mini drawing of the
  system's own canvas** (`systemDrawing.ts` reads the canvas into boxes and curves;
  `view/systemDrawingView.ts` draws them with `createSvg`, coloured by Obsidian's `--canvas-color-N`),
  its name, its one-line summary, its level as three dots, *n steps · m branch points* (`tCount`),
  and *In your vault* when the install record has it. Search (name, summary, description; case and
  accents folded) is the only control: the type and difficulty chips are gone. Steps and markdown
  templates are folded at the bottom as *Loose pieces*, each opening its existing install dialog.
  Templates are fetched as their cards scroll into view, once per session
  (`fetchSystemTemplate` is memoised). Loading shows skeleton cards; an unreachable gallery, or an
  unreachable system, is said inline with *Try again* — never a toast.
- **In place.** A card opens the system inside the room: a crumb back to *Systems*, the stage with the
  full drawing, and a panel (`view/systemPanel.ts`) with what it is, **Try it: walk the flow**, **How
  will you use it?**, the consequence and Install. The walk is #438's rehearsal **on the drawing**:
  the current step is lit, the visited ones and the edges taken stay marked, and an exit sends a dot
  along its edge while the camera (`frameStep`, a Reader `Cam`) frames where it leads. The review's
  findings and *pretend a property* stay under the walk. Nothing is read from the vault.
- **Install, without a dialog.** One role is recommended (*Create notes* only when no creation flow is
  set) with *Change* for the five. One sentence under it (`installConsequence.ts`) is rewritten on
  every change: what is created and where, how it runs, what it displaces by name, and that the notice
  can undo it. Code a system brings is named, and Install stays disabled until it is acknowledged.
  `installSystem()` validates, plans the role (a problem is said next to its field, nothing written),
  writes every file in **one** `withWriteBatch({ kind: "install" })` through
  `FileService.createFilesOnce`, then the role's setting, then the install record. Conflict and
  partial are said inline, and the button becomes *Try again*.
- **Land in the canvas.** The stage's drawing grows to fill the tab, and the Community leaf **opens the
  canvas** (`leaf.openFile`). Its history entry carries `{ room: "systems", flyHome: ref }`, so
  Obsidian's *Back* returns to Systems and the drawing flies home onto its card. The notice says
  *\<system\> is in your vault* and how it runs, with *Create a note* (for *Create notes* and *Just the
  files*) and *Undo*.
- **The shots** (`view/systemShots.ts`) reuse the Reader's `fly()` with `land: "become"`: one ghost of
  the drawing per shot, transform and opacity only, any key or press jumps it to its end, a timeout
  settles it, and under reduced motion every shot is a cut.

### The install record and Undo (#799)

Each successful install is one mechanical fact in `data.json`, `installedSystems?: InstalledSystem[]`
(`installRecord.ts`): the gallery ref and name, when, the folder, the canvas path, the role, the
setting it changed with its **previous value**, the folders it created, the write batch, and every file
with a **content hash** (`fnv1a8` of the canonical content; a canvas is hashed with sorted keys, so
Obsidian re-formatting it is not a change). It is optional, so loading never marks `data.json` dirty
for it, and it has no form: nobody authors it (§XIII), and it states no judgement (§XII). It is what
*In your vault* reads, and what Installed (S6) will list.

*Undo* in the notice (`undoInstall.ts`) takes the install back exactly: `undoBatch` through the write
record (#453); a file the record could not take back (its mtime moved, as when Obsidian re-saves the
canvas on open) is trashed anyway when its hash is unchanged, and **kept and named** when you changed
it; the folders it made go when empty (`FileService.trashEmptyFolder`); the role setting gets its
previous value back while it still points at this canvas; the record entry is dropped; and a tab still
showing that canvas goes back to Community on Systems. The result is one notice
(`changes_undo_done` / `changes_undo_partial_done`).

### Modals
- **`CommunityActionModal`** — preview of a single action (icon/label + rendered markdown
  description + `settingsReader`). Install toggles `settings.installedTemplates.actions[id]`.
- **`CommunityStepModal`** — preview of a step (metadata + each action via `settingsReader`);
  Install/Remove (with a confirm dialog) writes `installedTemplates.steps[id]`; "Manage" opens
  `InstalledStepEditorModal`.
- **`CommunityMarkdownModal`** — preview of a markdown template; Download writes the note into
  `communitySettings.markdownTemplateFolder` (Remove deletes it).
- A whole **system** has no modal since #799: it opens in place in the Systems room (above). The
  pure planner/validator still lives in `systemInstall.ts` (Obsidian-free, so it is unit-testable
  and every shipped system is checked against the registered action ids).
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
  deterministic file list (canvas + steps under the chosen folder); `installSystem()` creates them
  in one write batch with `FileService.createFilesOnce`, and the Community tab opens the canvas.

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

The last question before Install is now **how will you use it?** (since #799 it is asked in the
Systems room's panel, not in a dialog).

| Answer | What it writes | How it runs afterwards |
|---|---|---|
| Creates notes | the *new notes canvas* setting | the ribbon icon |
| Edits the open note | the *editor canvas* setting | the edit command, at your cursor |
| Runs on a folder | the canvas, **named after the folder** you pick | creating a note there |
| Runs on an event | the canvas, in the events folder | give its first step a trigger |
| Just the files | nothing | the *run a flow* command (what it always did) |

Three rules keep it honest:

- **Nothing is written before you agree — and Install is the agreement.** The sentence under the
  choice (rewritten live, #799) names the folder the files go to, the canvas that would stop holding
  an exclusive role (it keeps existing as a file), and how the system will run. There is no
  confirmation dialog any more; walking away writes nothing, and the notice's *Undo* takes an install
  back exactly.
- **No destructive default.** *Create notes* is pre-selected only when no canvas holds that role
  yet, which is the common first install and displaces nobody. Otherwise the panel starts at
  *just the files*.
- **The success notice says how it runs**, in those words, instead of naming a command.

Everything else is unchanged: still create-only and idempotent (`createFilesOnce`), still validated
before install, still one static fetch from GitHub raw — no backend (#294).
