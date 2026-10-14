# Community gallery (static)

ZettelFlow lets users **browse, preview, install and reuse** shareable building blocks —
*actions*, *steps*, *markdown* notes, and complete *systems*. The gallery is **fully
static**: it reads a catalog and its payloads straight from the repo over GitHub raw. There is **no
backend** to run — no server, no database, no accounts, no network writes from the plugin.

Since #797 all of it lives in one view, **Community**, with four rooms (no modal, no tabs). This page
is how it is built; the reader's page is [Community](../community/index.md), and adding a tutorial is
[Adding a tutorial](../how-to-contribute/adding-a-tutorial.md).

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
- **The rooms' contents.** Each room is a `RoomRenderer` (`view/communityRoomHost.ts`), and all four
  are native DOM: Systems (#799), Learn (#801, #802), Contribute and Installed (#803), all below.
  **The view mounts no React** (`communityShellGone.test.ts`). A room's handle may add to the view's
  state (`viewState` / `applyState`), take Esc (`onEscape`) and hear that the focused canvas changed
  (`canvasChanged`). `host.openRoom(room, then?, state?)` pans to a room, hands `state` to the rooms
  once it has arrived, then runs `then`; `openCommunity(app, room, state)` does the same from outside.
- **A room out of view holds still.** Besides being `inert` and hidden, every CSS animation inside an
  away room is paused (`animation-play-state`), so a Systems card still waiting for its drawing does
  not keep Obsidian's `is-loading` bar ticking behind another room.

### The Systems room (#799)

The whole adoption path, in one shot, in `view/systemsRoom.ts` (native DOM; no React):

- **The room.** Systems in two groups, in catalog order: **A whole method** (more than one step)
  and **One note, done well** (`systemsCatalog.groupSystems`). Each card is a **mini drawing of the
  system's own canvas** (`systemDrawing.ts` reads the canvas into boxes and curves;
  `view/systemDrawingView.ts` draws them with `createSvg`, coloured by Obsidian's `--canvas-color-N`),
  its name, its one-line summary, its level as three dots, *n steps · m branch points* (`tCount`),
  and *In your vault* when the install record has it — re-read each time the camera arrives
  (`shown()`), so a *Remove* in Installed takes the badge off without reopening the view (#804). Search (name, summary, description; case and
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
*In your vault* reads, and what Installed lists (#803, below).

*Undo* in the notice and Installed's *Remove* are **one function**, `takeBackInstall`
(`removeInstall.ts`, #803), described with Installed below. From the notice it takes the install back
exactly while the batch is in memory; a tab still showing that canvas goes back to Community on
Systems, and the result is one notice (`changes_undo_done` / `changes_undo_partial_done`).

### The Learn catalog (#801)

Learn's tutorials are **data on `main`**, not code: `docs/learn/catalog.json`, read over GitHub raw
like the gallery's catalog. A tutorial merged to `main` reaches every user on their next visit to
Learn, with no plugin release, and `main.js` does not grow with it (`learnNotBundled.test.ts`).

**The file.** Every user-visible string is `{ "en": "…", "es": "…" }`.

```jsonc
{
  "schema": { "major": 1, "minor": 0 },   // a newer major is not read by this plugin
  "tracks": [{ "id": "first-ten-minutes", "title": {…}, "blurb": {…}, "tutorials": ["get-started", …] }],
  "tutorials": { "<id>": {
      "title": {…}, "summary": {…}, "minutes": 5, "level": "easy | medium | hard",
      "door": {…},                                          // where it is, in UI words
      "tryIt": { "capability": "<CapabilityId>", "label": {…} },   // optional: Do it now
      "hero": "docs/resources/…/x.svg",
      "steps": [{ "title": {…}, "body": {…}, "image": "docs/resources/…" }],   // 3–6
      "tip": {…}, "doc": "development/reader.md", "related": ["<id>"],
      "since": "3.7.0" } },                                  // the oldest plugin it describes
  "reference": [{ "name": {…}, "line": {…}, "door": {…}, "group": {…},
                  "doc": "…", "tutorial": "<id>", "capability": "<CapabilityId>" }],
  "faq": [{ "q": {…}, "a": {…} }]
}
```

**One schema, two tempers** (`learn/learnCatalog.ts`, pure and Obsidian-free):

- `validateLearnCatalog` is **CI's**, and strict (`test/docs/learnCatalog.test.ts`). It checks the
  shape, unique ids, that every track's ids resolve and every tutorial is in exactly one track, that
  related ids resolve, 3–6 steps, non-empty en **and** es everywhere, that every `image` exists under
  `docs/resources/` and every `doc` under `docs/`, that every `capability` is in `CAPABILITIES`, and
  that `since` is a version no newer than `manifest.json`'s. Each problem names its entry
  (`tutorials.undo.steps: 2 steps (needs 3–6)`). The same test runs the settings-path parser over
  every en string, and checks that the es strings name es groups, *Pensar* and *Biblioteca*.
- `parseLearnCatalog` is **the plugin's**, and lenient: an entry that is wrong is dropped and the rest
  is kept, a tutorial whose `since` is newer than the running plugin is left out of the tracks (and so
  of search and the progress count), and a newer **major** schema is not read at all.
- **Coverage** (`test/docs/learnCoverage.test.ts`, decision 6 on #797): every id in `CAPABILITIES` is
  named by a tutorial's `tryIt` or a reference row's `capability`. An exception goes in its
  `UNCOVERED` register with an issue number, and the register can only shrink. A new capability
  without a line in Learn fails the build.

**Untrusted data.** Every string is drawn as text (`createEl({ text })`), never as markup. A `doc` must
be a relative page (`[A-Za-z0-9/_-]+.md`, no `..`, no scheme), and *Read the full page* opens only the
docs site URL `docUrl()` builds from it. An image must be under `docs/resources/`; anything else is
never requested. A `tryIt` names a capability id that resolves locally to that capability's door, and
an unknown id drops the button. Nothing in the catalog can name a command id, a URL or code.

**Fetch and cache** (`learn/learnSource.ts`):

- The catalog is fetched (`fetchLearnCatalog()`) only when the Learn room is **shown** — opened there
  or panned to — and **at most once a session**. Plugin load, and a Community view opened on another
  room, ask for nothing.
- The last valid copy is kept in Obsidian's per-vault local storage (`app.saveLocalStorage` through
  `ObsidianApi.saveLocal`, key `zettelflow-learn`) as `{ catalog, fetchedAt, seen }`: the JSON as
  fetched, when, and the tutorial ids already shown. Never `data.json`, which every start reads
  (#795), and never the Adapter. A save that fails (storage full) is logged at debug, and what is in
  memory still renders.
- The saved copy renders at once, and the fetch replaces it in place. On a failure — offline, an HTTP
  error, a file that is not a catalog — the saved copy stays and the room says inline *Offline: you
  are seeing the copy saved on &lt;date&gt;.* A newer major schema reads *Update ZettelFlow to see the
  latest tutorials.* With no copy at all, the room says *Learn needs a connection the first time.*
  and links to the docs site. There is never a toast; the failure goes to the log at debug.
- **New since your last visit.** On the first visit ever every id is marked seen, so nothing is
  *New*. Later, a tutorial whose id is not in `seen` carries *New* until it is opened or done
  (`markSeen`).

**Illustrations** (`learn/learnImages.ts`). GitHub raw serves `.svg` as `text/plain`, which an
`<img src>` does not draw (#651), so each image is fetched with `requestUrl`, typed by
`previewBlobType` and drawn from a `blob:` URL — one per path per view, all revoked when the view
closes. One that cannot load leaves a quiet empty frame; images are not cached offline.

### The Learn room (#802)

The room people come back to, in `view/learnRoom.ts` (native DOM; no React, no emoji):

- **The hero.** *Everything ZettelFlow does, step by step*, one lede line, a large search *What do
  you want to do?*, up to five starter chips (the first tutorial of each of the first five tracks) and
  the catalog's one freshness line (above).
- **The progress card.** A ring (an SVG circle with `pathLength="100"`, its dash set from the
  `--zf-learn-ring` custom property, unanimated) and *n of N tutorials* (`tCount`), *Your progress
  stays in this vault.*, and the next thing to do: *Start here* (nothing done or opened), *Pick up
  where you left off* (the last opened if it is not done, else the first not done in track order) or
  *You have done them all.* (`learn/learnProgress.ts`, pure).
- **Tracks**, in catalog order: title, a bar (`transform: scaleX(var(--zf-learn-track))`), `d/n`, the
  blurb and a row of cards that scrolls sideways. A card is its hero picture (loaded as it scrolls
  into view), title, summary, minutes, level, *Done* when done and *New* (S4); done wins over new.
- **Look anything up.** The reference rows (name, line, door), group chips (*All* and each group), the
  first ten and *Show all n*. A row with a tutorial opens its lesson; one without opens its docs page
  in the browser. **Questions people ask** are `<details>` rows.
- **Search** (`learn/learnSearch.ts`, pure). Typing replaces the tracks, the reference and the
  questions with three groups: *Tutorials · n* (title, summary, step text), *Reference · n* (name,
  line, door) and *Questions · n* (question and answer, opened). Case and accents are folded
  (`biblioteca` finds *Biblioteca*, `canvás` finds *canvas*), in Obsidian's language, over the parsed
  catalog — so a tutorial about a newer plugin is not found. A match is a `mark` around a text node,
  built from `matchRanges` (ranges in the original text). No hits: *Nothing matches «q».* and *Clear
  the search*.
- **Loading.** On a first visit with no saved copy, four skeleton cards hold the room's shape until
  the catalog arrives; with no copy and no network, the empty state only.

**The lesson** (`view/learnLesson.ts`) opens **in place**: the room steps aside (its nodes stay; Back
puts it back as it was, at the same scroll) and the lesson shows a crumb *Learn / \<track\>*, a stage
and a side panel — title, summary, minutes, level, *Step i of n*, **Where it is** (the door), the
numbered steps (each one a place to jump to), the tip, *Previous* / *Next step*, and the end:
*Mark as done* (toggles *Done*), *Do it now*, *Read the full page* (the docs site, `docUrl`), *Up next*
(the next tutorial in its track, else the first of the next) and *Related*.

- **The film.** The stage is a film strip of the step pictures (`filmOf`): one frame per **picture**,
  not per step, so a step without its own image keeps the one before and the camera holds still. The
  frame in view is the `--zf-learn-frame` custom property; the move is one Web Animations `transform`.
- **Do it now** (`learn/doItNow.ts`). `resolveDoor(capability)` takes the first door in
  `CAPABILITY_DOORS` that Learn can **run**: a ribbon entry or a command runs the command
  (`runCommand`), a surface or Home's line opens the surface at its mode (`activateSurface`), a
  settings door opens ZettelFlow's settings on its section. A control inside another view and a file's
  context menu need an object Learn does not have, so they are skipped — and a capability with no
  runnable door gets no button (today: *collision*, *claim-door*, *reader-ink*, *base-dashboard*). The
  button is labelled by the tutorial's own `tryIt.label`, and Community stays where it was.
- **Keys.** While Learn is in view, `/` (and Shift+/, for keyboards where `/` needs Shift) focuses the
  search unless focus is in a text field. While a lesson is open, Down or Right goes to the next step
  and Up or Left to the previous one, unless focus is in a text field or on the room nav; Esc closes
  the lesson (the view's Esc asks the room first, `onEscape`). The keys are registered on the view's
  `Scope` (`CommunityRoomHost.scope`) and unregistered when the lesson closes or Learn leaves the
  shot, so they never reach the editor and Esc never closes the leaf.
- **A deep link** names a tutorial: `{ room: "learn", tutorial: "<id>" }` opens its lesson once the
  catalog is there (for Contribute's *How to contribute*, #803).

**Progress** is the vault's: `learnProgress?: { done: string[]; last?: string }` in `data.json`
(`config/typing.ts`), so it follows the vault to your other devices, while the *seen* set stays per
device in local storage (above). It is mechanical (§XII) and not configuration, so it has no form
(§XIII); it is optional, so loading never marks `data.json` dirty, and only looking at Learn writes
nothing. Opening a lesson records it as the last opened; *Mark as done* records it done. Writes are
debounced (400 ms) and flushed when the view closes. The nav's Learn count is `done/total` over the
tutorials the tracks show.

**The shots** (`view/learnShots.ts`; §XVI one continuous shot) reuse the Reader's `fly()` and
`MOTION`: the pressed card's picture (or the chip, row or result pressed) grows onto the stage with
`land: "become"`; the camera goes down the film; *Up next* and *Related* slide the next lesson in from
the right as the one you were on leaves to the left and fades (`MOTION.turn`), and Back still returns
to the room; Back or Esc flies the picture home onto the card of the lesson open (scrolled into view
first), or to the element pressed. Marking a tutorial done redraws the ring, the bars and the cards
behind the lesson at once, so the card you return to already says *Done*. One moving element per
shot, transform and opacity only, any key or press jumps it to its end (an Esc or Back pressed
mid-shot closes the lesson the moment it lands), a timeout settles it, a shot never waits for a
picture longer than 400 ms, and under reduced motion each one is a cut.

### The Contribute room (#803)

`view/contributeRoom.ts`, native DOM. The lede says it: *Everything goes through GitHub. Nothing leaves
your vault until you publish it yourself.*

- **Share this canvas as a system** leads, across the row. Its preview is the **share candidate**
  (`shareCandidate`, pure, in `shareSystem.ts`): the canvas most recently focused **in this window**,
  else the creation flow (`ribbonCanvas`), else none. The view tracks the focused canvas itself
  (`active-leaf-change`, seeded from `getMostRecentLeaf()`; until a canvas is focused, the newest
  `getLastOpenFiles()` canvas that still exists stands in, so a deleted one is never offered), because while
  Community is the active tab `getActiveFile()` is `null`. The preview is the canvas drawn from the
  vault (`systemDrawing` over its JSON, `cachedRead`, no network), its file name and *n steps · m branch
  points*. With no candidate, the card says *Open a canvas to share it.* and the button is disabled:
  no toast after the click.
- **Prepare the system** runs today's flow, now data (`shareFlow(built)`): the `ADD_TEMPLATE.yaml` form
  prefilled when it fits in the URL, else a download of the `.zftemplate` and the form with a paste
  hint. The download is said inline in the card. `shareSystem.test.ts` pins both outputs.
- **Report a bug** shows the environment the form will receive (`bugReportFields`: plugin version,
  Obsidian version, platform) before you press it, and opens the form with exactly those fields.
  **Suggest an idea** opens the feature-request form; **Talk to other users** opens Discussions.
- **How to contribute well** pans to Learn and then opens the tutorial `contribute-a-system`, in
  sequence: `host.openRoom("learn", undefined, { tutorial })` hands the state over once the pan has
  arrived, and the Learn room opens the lesson. When the catalog (the session's one fetch, or the saved
  copy) has no such tutorial, it opens the contributing docs page instead.
- Every card's icon is Lucide (`share-2`, `lightbulb`, `bug`, `messages-square`, `graduation-cap`);
  no emoji.

### The Installed room (#803)

`view/installedRoom.ts`, native DOM: what you brought from the gallery, and how to take it back.

- **Systems you installed** come from the install record, newest first. Installs made before the
  record existed are not detected (decision 2 on #797). Each row draws **its canvas as it is in your
  vault now** (`cachedRead`, no network), its name and *Installed \<date\> · \<folder\> · \<role\>*.
- **Open canvas** grows the row's drawing to fill the tab, and the tab becomes the canvas. The history
  entry carries `{ room: "installed", installedHome: id }`, so Obsidian's *Back* flies it home onto its
  row.
- **Remove** asks once: *Remove*, then *Remove n files*. Panning away or the room redrawing disarms
  it, and one press writes nothing. Confirmed, it calls `takeBackInstall`, which plans with
  `planRemove(record, facts)` (pure):

  | Fact | What happens |
  |---|---|
  | The batch is on the write record, not undone, inside `WRITE_WINDOW_MS`, and no file changed | **exact**: `undoBatch`, then the hash for any file it refused |
  | Otherwise | **safe**: by content hash only |
  | A file still as installed | to Obsidian's trash (`FileService.deleteFile`, which is `fileManager.trashFile`) |
  | A file you changed | **kept**, and named |
  | A file already gone | skipped |
  | The role's setting still points at this canvas | its previous value comes back, **before** anything is trashed (#712) |
  | A folder the install made, now empty | to the trash |
  | Always | the record entry is dropped |

  A file you changed is never handed to the write record, which decides by mtime alone. The result is
  one line where the row was, from two counted phrases (`tCount`): *Removed 4 files. Kept 1 you
  changed: Permanent.md.* The row slides out and the rows below close the gap by FLIP
  (`collapseRow` in `view/systemShots.ts`): transform and opacity only, a timeout settles it, a cut
  under reduced motion.
- **A canvas you deleted or moved** leaves its row with *Canvas not found* and **Forget it**, which
  drops the record entry and touches nothing in the vault (`forgetInstall`).
- **Loose pieces**: the installed steps and actions, each with *Edit* (its own editor modal,
  unchanged, loaded when asked for) and *Remove* (asks once, then deletes the entry and saves). The
  clipboard import sits in this section's header. The old search box and type chips are gone.
- **Empty**: *Nothing installed yet.* with *Browse systems* (pans to Systems), and *No loose pieces
  installed.* The nav's count is systems plus pieces, and a zero is not drawn.

**What #803 subtracted:** the React panels `ContributeTab`, `InstalledTemplatesManagement` and the
interim host `legacyRooms.tsx`; `undoInstall.ts` (folded into `removeInstall.ts`); the no-canvas
toast; the loose-piece search and filter chips; emoji in both rooms; and their dead styles.

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
| `fetchLearnCatalog()` | `${BASE}/docs/learn/catalog.json` | the Learn catalog as JSON, untrusted until `parseLearnCatalog` reads it |

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

- **Share this canvas as a system** — exports the canvas you last had open (else the creation flow)
  to a `.zftemplate` and opens the
  [Add a template](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/new?template=ADD_TEMPLATE.yaml)
  issue form with the bundle prefilled (or, if the bundle is too large for the URL, downloads the
  `.zftemplate` and opens the form with a paste hint).
- **Suggest an idea** / **Report a bug** — open the feature-request / bug-report forms (the bug form
  arrives with your plugin version, Obsidian version and platform filled in).
- **Talk to other users** — opens GitHub Discussions.
- **How to contribute well** — opens the contributing tutorial in Learn.

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

## The subtraction ledger (#797)

What the Community view replaced, so that nothing comes back by accident. Each row went in the slice
named; the docs guardrail `test/docs/communityDocs.test.ts` allows these names here and nowhere else.

| Removed | Slice | What does the job now |
|---|---|---|
| `CommunityTemplatesModal` and its tabbed `CommunityHub` (the *Community Hub* modal) | #798 | the Community view and its four rooms |
| `ManageInstalledTemplatesModal`, and the ribbon's *Manage installed* row | #798 | the Installed room (one *Community* entry in the ribbon menu) |
| `CommunitySystemModal`, `StaticTemplatesGallery`, `SystemRehearsalPanel` | #799 | the Systems room: cards, the walk on the drawing, the panel |
| The confirmation dialog on install | #799 | the consequence sentence; *Undo* in the notice |
| The type and difficulty filter chips; `systemPreviewUrls` | #799 | search only; the room draws each canvas itself |
| `LearnTab` and its emoji guide cards; 16 `community_learn_*` keys | #801, #802 | the Learn catalog on GitHub raw and the Learn room |
| `ContributeTab`, `InstalledTemplatesManagement`, the interim `legacyRooms.tsx` | #803 | the Contribute and Installed rooms, native DOM — no React left in the view |
| `undoInstall.ts` | #803 | `takeBackInstall` in `removeInstall.ts`, one take-back for *Undo* and *Remove* |
| The no-canvas toast, the loose-piece search box and its type chips; 8 locale keys | #803 | an inline line; the loose pieces as one short list |
| `docs/resources/community/community-browser.svg`, the drawing of the old modal | #804 | `rooms.svg` and `install-shot.svg` |

Kept on purpose: the #438 rehearsal's findings and *pretend a property* (under the walk), the clipboard
import (in Installed's *Loose pieces*), and the commands `open-community-templates`,
`open-manage-templates` and `browse-systems` as aliases, so a bound hotkey survives (§XI).
