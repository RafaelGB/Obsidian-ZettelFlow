# Community feature & backend

ZettelFlow lets users **browse, preview, install and reuse** shareable building blocks —
*actions*, *steps*, *markdown* notes, whole *flows*, and complete *systems*. This page covers the
frontend community module and the optional FastAPI/MongoDB backend.

## 1. Two data sources

The community browser has **two independent sources**, chosen at runtime by whether a `token`
is set in `communitySettings`:

| Source | Component | Backing service | Supports |
|---|---|---|---|
| **Static** (default) | `StaticTemplatesGallery` | `raw.githubusercontent.com/RafaelGB/Obsidian-ZettelFlow/.../main` | steps, actions, **markdown, flows, systems** |
| **Dynamic** (token set) | `CommunityTemplatesGallery` | the FastAPI backend at `communitySettings.url` | steps, actions |

```ts
// CommunityTemplatesModal
if (token && token.length > 0) render(<CommunityTemplatesGallery/>);  // backend API
else                          render(<StaticTemplatesGallery/>);      // GitHub raw JSON
```

> The `token` only *toggles the source*; it is **not** sent as an `Authorization` header. The
> backend currently has no auth.

## 2. Frontend module — `src/application/community/`

### Modals

- **`CommunityTemplatesModal`** — shell; renders a navbar (with an "Add template" link to a
  GitHub issue form) and mounts the dynamic or static gallery.
- **`CommunityActionModal`** — preview of a single action (icon/label + rendered markdown
  description + `settingsReader`). Install toggles `settings.installedTemplates.actions[id]`.
- **`CommunityStepModal`** — preview of a step (metadata + each action via `settingsReader`);
  Install/Remove (with a confirm dialog) writes `installedTemplates.steps[id]`; "Manage" opens
  `InstalledStepEditorModal`.
- **`CommunityMarkdownModal`** — preview of a markdown template; Download writes the note into
  `communitySettings.markdownTemplateFolder` (Remove deletes it).
- **`CommunityFlowModal`** — the richest: previews a whole flow (fetches `image.png`), "Copy to
  clipboard" (stores the flow in `communitySettings.clipboardTemplate`), "Download flow files"
  (writes referenced markdown into the vault and rewrites node `file` paths), and renders the
  nodes (grouped by type) and edges.
- **`CommunitySystemModal`** (#214) — previews a whole **system** shipped as the unified
  [`.zftemplate`](zftemplate-schema.md) bundle: name, author, description, an optional
  sibling preview image, and the list of files that will be written. "Install system" picks a
  target folder (default `foldersFlowsPath`), then `planSystemInstall` + `FileService.writeFile`
  create the canvas and every step note in one click (no clipboard, no manual paste) and open the
  canvas. The pure planner/validator lives in `systemInstall.ts` (Obsidian-free, so it is
  unit-testable and every shipped system is checked against the registered action ids).
- **`ManageInstalledTemplatesModal`** — manages installed templates; "Add template from
  clipboard" imports `clipboardTemplate` into `installedTemplates`.
- **`UsedInstalledStepsModal`** — a picker (`StepTemplatesSelector`) used to drop an installed
  step onto a canvas node.

### HTTP client — `services/CommunityHttpClientService.ts`

Targets **only** the GitHub-raw static source (uses Obsidian's `request()`):

```ts
COMMUNITY_BASE_URL = "https://raw.githubusercontent.com/RafaelGB/Obsidian-ZettelFlow/refs/heads/main";
```

| Function | URL | Returns |
|---|---|---|
| `fetchCommunityTemplates()` | `${BASE}/docs/main_template.json` | `StaticTemplateOptions[]` |
| `fetchActionTemplate(ref)` | `${BASE}${ref}` | `CommunityAction` |
| `fetchStepTemplate(ref)` | `${BASE}${ref}` | `CommunityStepSettings` |
| `fetchFlowTemplate(ref)` | `${BASE}${ref}/flow.json` | `CommunityFlowData` |
| `fetchSystemTemplate(ref)` | `${BASE}${ref}` | `ZfTemplate` (parsed `.zftemplate`) |
| `fetchMarkdownTemplate(ref)` | `${BASE}${ref}` | raw markdown |

The **dynamic** gallery has its own inline fetchers (in `CommunityTemplatesGallery.tsx`) hitting
`{url}/templates/filter`, `{url}/steps/{id}`, `{url}/actions/{id}`. It renders cards with debounced
search, All/Step/Action filters, and **infinite scroll** (`IntersectionObserver`, page size 15).

### How templates are imported

- **Steps / Actions** — "install" just serializes the object into
  `settings.installedTemplates.steps|actions[id]`. No files are written; installed steps later
  become canvas nodes (`node.unknownData.zettelflowConfig`) or are edited via
  `InstalledStepEditorModal`.
- **Markdown** — written as a real note into `markdownTemplateFolder`.
- **Flows** — "Copy to clipboard" → `clipboardTemplate`; "Download flow files" writes the
  markdown and rewrites node paths; the clipboard flow is imported via
  `ManageInstalledTemplatesModal`.
- **Systems** (#214) — the modern one-click path. `planSystemInstall` turns a `.zftemplate` into a
  deterministic file list (canvas + steps under the chosen folder); the modal writes each with
  `FileService.writeFile` and opens the canvas. No clipboard round-trip; the same unified format
  the local export/import commands use.

## 3. Backend — `backend/`

A **FastAPI + MongoDB** service in **hexagonal / clean architecture**. It is *optional*: the
plugin works fully against the static GitHub source without it.

### Layer map

```
backend/app/
├── main.py                 # composition root: FastAPI factory + dependency injection
├── domain/models/          # pure Pydantic models (CommunityAction, CommunityStepSettings, template_filter)
├── application/services/    # use-cases: action_service, step_service, template_service
├── infrastructure/
│   ├── db/mongodb.py       # MongoDBClient (env-configured) + serialize helpers
│   └── repositories/        # action/step/template repositories (PyMongo)
└── interfaces/api/
    ├── controllers/         # get_*_router() factories — the ACTUAL routes
    └── routers/             # ⚠ present but EMPTY (vestigial)
```

Dependency direction points inward: `main` builds one `MongoDBClient` → injected into three
repositories → injected into three services → injected into three router factories. All three
repositories read/write a **single Mongo collection** `community_templates`, discriminated by a
`template_type` field. `TemplateRepository.read_templates` builds a case-insensitive `$regex`
`$or` over title/description and paginates with a `limit+1` look-ahead to compute `has_next`.

### REST API

| Method | Path | Purpose | Response |
|---|---|---|---|
| POST | `/steps/create` | create a step (unique title) | created doc (`template_type:"step"`, `downloads:0`) — 400 if title exists |
| GET | `/steps/{step_id}` | read a step | doc — 404/400 |
| DELETE | `/steps/{step_id}` | delete a step | `{deleted_count}` |
| POST | `/actions/create` | create an action (unique title) | created doc — 400 if exists |
| GET | `/actions/{action_id}` | read an action | doc — 404/400 |
| GET | `/templates/filter` | paginated + searchable list | `{ items:[6 fields], page_info:{skip,limit,has_next} }` |
| GET | `/templates/item/{item_id}?item_type=` | read by id + type | doc — 400 if bad type |
| DELETE | `/templates/delete/{template_id}` | delete any template | `{deleted_count}` |

Every route declares `response_model=Dict`, so the domain response models
(`template_filter.py`) are **not enforced** at the transport layer. There is **no CORS, no
auth, and no health route**.

> **Contract drift (harmless):** the frontend's `CommunityTemplatesResponse` expects `total` /
> `has_previous`, which the backend never returns — but the frontend only reads `has_next` and
> `items.length`.

### Deployment — `docker-compose.yml`

Two services on one bridge network:

- **`mongodb`** — `mongo:6.0`, port `27017`, named volume `mongodb_data`, `mongosh` healthcheck,
  env from a root `.env` (`MONGO_INITDB_ROOT_USERNAME/PASSWORD`, `MONGO_INITDB_DATABASE`).
- **`fastapi`** — built from `backend/dockerfile` (`python:3.11-slim`, `uvicorn main:app
  --reload`), port `8000`, source bind-mounted (`./backend/app:/app`) for hot-reload,
  `depends_on` mongodb healthy.

The app reads `MONGODB_USERNAME/PASSWORD/HOST/PORT/DB` (compose supplies these from the Mongo
credentials). `requirements.txt` pins FastAPI, uvicorn, pydantic v2, pymongo — **and** the whole
MkDocs docs toolchain. The `--reload` flag + bind mount make this a **development** posture; a
production deployment would drop `--reload`, add CORS/auth, and remove the docs deps.

## 4. End-to-end: browse → install (dynamic path)

1. User sets `communitySettings.url` + a `token`; opens **Community Templates**.
2. Token present → `CommunityTemplatesGallery` calls `GET {url}/templates/filter?skip=0&limit=15`.
3. Backend: `template_controller.filter_templates` → `TemplateService` → `TemplateRepository`
   runs the Mongo regex+pagination query → `{items, page_info}`.
4. Scrolling triggers the `IntersectionObserver` → `skip += 15`; debounced search re-queries.
5. Clicking a card → `GET {url}/steps/{id}` or `/actions/{id}` → opens the preview modal.
6. **Install** writes the object into `settings.installedTemplates` and `saveSettings()`.
7. The installed step is reusable via `UsedInstalledStepsModal` (dropped on a canvas node) or
   `InstalledStepEditorModal` (edited).
