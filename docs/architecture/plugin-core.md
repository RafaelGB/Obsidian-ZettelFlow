# Plugin core

How the plugin boots, configures itself, registers its building blocks, and integrates with
Obsidian's Canvas. Read [Overview](overview.md) first.

## 1. Entry point — `src/main.ts`

`class ZettelFlow extends Plugin`. State: `settings: ZettelFlowSettings` and a
`canvasExtensions: CanvasExtension[]`.

`onload()` runs a fixed, ordered bootstrap:

1. `loadSettings()` — merge `DEFAULT_SETTINGS` + persisted `loadData()`, strip the transient
   `communitySettings.clipboardTemplate`, re-save, then `loadServicesThatRequireSettings()`
   (configures the logger from settings).
2. `loadVariableTextProcessors(this)` — the `{{frontmatter}}` rendering pipeline.
3. `loadPluginComponents(this)` — registers and loads the three `ZComponent`s.
4. `registerViews()` — the `CodeView` for `.js` files.
5. `registerActions()` — populate the `actionsStore` with the 11 built-in actions.
6. `Hooks.setup(this)` — wire vault/menu events (see [Vault hooks](vault-hooks-internals.md)).
7. `new CanvasPatcher(this)` — monkey-patch the Canvas view.
8. Instantiate every extension in `allCanvasExtensions`.

`onunload()` only calls `actionsStore.unregisterAll()`. Everything else relies on Obsidian's
automatic teardown of `Plugin.register*` registrations and the `monkey-around` uninstallers
registered via `plugin.register(...)`.

> ⚠️ **Known gap:** `ZComponentsManager.unloadComponents()` is never called in `onunload`, so
> component-specific `onUnload()` logic does not run. Most resources are still cleaned up by
> Obsidian, but this is worth fixing (see [Project health](../development/project-health-and-roadmap.md)).

## 2. Bootstrap subsystem — `src/starters/`

### `ZComponent` lifecycle

`architecture/plugin/Lifecycle.ts` defines the abstraction:

```ts
interface ZComponent { onLoad(): void; onUnload(): void; }
abstract class PluginComponent implements ZComponent {
  constructor(_plugin: ZettelFlow) {}
  abstract onLoad(): void;
  onUnload(): void {}
}
```

`ZComponentsManagerService` (singleton) holds a `PluginComponent[]`; `loadComponents()`
iterates `onLoad()`. `loadPluginComponents()` registers three components and loads them:

- **`RibbonIcon`** — adds the ribbon button + `open-workflow` command; registers three SVG
  icons; opens `SelectorMenuModal` with the `ribbonCanvas` flow.
- **`SettingsTab`** — `addSettingTab(new ZettelFlowSettingsTab(...))`; registers commands
  `open-canvas`, `open-community-templates`, `open-manage-templates`; runs
  `legacyMigrateSettings()` (migrates old `propertyHooks` → `hooks.properties`).
- **`PluginApi`** — initializes the global service singletons:
  `ObsidianAPIService.init(app)`, `ZfVaultImpl.instanceInit(app)`, `VaultStateManager.init(plugin)`.

### `{{frontmatter}}` processors — `starters/services/VariableTextProcessors.ts`

Substitutes `{{key}}` with the active file's frontmatter, three ways:

- a **markdown post-processor** (rewrites rendered `<p>` HTML — note: uses `innerHTML`, a
  guideline flag, see [scoring](../development/obsidian-review-and-scoring.md));
- a **CodeMirror 6 live-preview** `ViewPlugin` decorating placeholders with a
  `SelectableTextWidget`;
- an **`EditorSuggest`** offering frontmatter keys when you type `{{`.

## 3. Settings — `src/config/`

### The shape — `config/typing.ts`

`ZettelFlowSettings` fields: `loggerEnabled`, `logLevel`, `uniquePrefixEnabled`,
`tableOfContentEnabled`, `uniquePrefix`, `ribbonCanvas`, `editorCanvas`, `jsLibraryFolderPath`,
`foldersFlowsPath`, `installedTemplates` (`{ steps, actions }`), `communitySettings`
(`{ markdownTemplateFolder, url, token?, clipboardTemplate? }`), and `hooks`
(`{ properties: Record<string, {script}>, folderFlowPath }`).

`DEFAULT_SETTINGS` notable defaults: `foldersFlowsPath: "_ZettelFlow/folders"`,
`hooks.folderFlowPath: "_ZettelFlow/hooks"`, `communitySettings.url: "http://127.0.0.1:8000"`,
`communitySettings.markdownTemplateFolder: "_ZettelFlowMdTemplates"`,
`uniquePrefix: "YYYYMMDDHHmmss"`.

### The settings tab — chain of responsibility

`ZettelFlowSettingsTab extends PluginSettingTab`. `display()` builds a navbar then delegates to
`SettingsManager`, which runs **three section handlers**, each rendering into its own child div:

| Section | Handler | Contents |
|---|---|---|
| **General** | `handlers/GeneralSectionSettings.ts` | community browser, ribbon/editor canvas selectors, folders-flow + markdown-templates + scripts folders, unique-prefix toggle/pattern |
| **Hooks** | `handlers/HooksSectionSettings.ts` | property→script hooks (React `PropertyHooksManager`), folder-flow path |
| **Developer** | `handlers/DeveloperSectionSettings.ts` | logger toggle + level, community backend URL/token |

Each section is an `AbstractChain<SettingsHandlerInfo>` (`before`/`after`/`refresh`) built as a
module-level singleton. `SettingsHandlerInfo = { containerEl, plugin, section? }`.

## 4. The action registry — `ActionsStore`

`architecture/api/store/ActionsStore.ts` is a **`Map<string, CustomZettelAction>`** singleton
(not Zustand), keyed by `action.id`:

- `registerAction` / `unregisterAction` / `unregisterAll`
- `getAction(id)` — throws if missing
- `getDefaultActionInfo(id)` — clones the action's `defaultAction` and assigns a fresh
  `uuidv4()` id (used when a designer drops an action onto a step)
- `getIconOf(id)` — special-cases `"bridge"` → `zettelflow-bridge-icon`

`main.registerActions()` registers all 11 built-ins. See
[Actions & note builder](actions-and-note-builder.md) for the action contract itself.

## 5. Canvas integration — `architecture/plugin/canvas/`

ZettelFlow treats a `.canvas` file as a workflow graph. Because Obsidian's Canvas has no public
extension API, the plugin **monkey-patches** it.

### `CanvasPatcher`

On construction it waits for `workspace.onLayoutReady`, resolves a fully-loaded `CanvasView`
(handling deferred views via `loadIfDeferred()` when `requireApiVersion('1.7.2')`), then patches:

- `canvasView.canvas.menu.render` → after render, fire workspace event **`canvas:popup-menu`**.
- `CanvasView.getViewData` → serialize with `json-stable-stringify` (deterministic), falling
  back to `JSON.stringify` then the original.
- `CanvasView.setViewData` → on invalid JSON, repair with `tiny-jsonc` (tolerates trailing
  commas), then fire **`zettelflow-node-connection-drop-menu`**.

### `PatchHelper`

A typed wrapper over `monkey-around`'s `around`. Every uninstaller is registered with
`plugin.register(...)` so patches auto-revert on unload. Provides `OverrideExisting` (require the
method to exist), `patchObjectPrototype`, `patchPrototype`, and `tryPatchWorkspacePrototype`
(retries on `layout-change` until the target appears).

### Canvas extensions (`allCanvasExtensions`)

Both extend `CanvasExtension` (constructor stores `plugin`, calls `abstract init()`):

- **`EditStepCanvasExtension`** — listens to `canvas:popup-menu`; on a ZettelFlow canvas adds
  "Edit ZettelFlow Step" (single selection → `StepBuilderModal`) or "Copy Flow to Clipboard".
- **`AddManagedStepExtension`** — listens to `zettelflow-node-connection-drop-menu`; adds
  "Create Managed Step" (if templates are installed: pick one first; otherwise: blank step config)
  → creates a node with `unknownData.zettelflowConfig`) and "Import Flow Data from Clipboard".

All extensions gate on `CanvasHelper.isCanvasFlow(plugin)` — i.e. the active file is
`ribbonCanvas` / `editorCanvas` or lives under `foldersFlowsPath` / `hooks.folderFlowPath`.

### Flow model — `Canvas.ts` / `Flows.ts`

`canvas` is a lazy singleton exposing `flows` (a cache) and an in-memory `clipboard`.
`FlowsImpl` is a `Map<path, Flow>`; `add()` parses a `.canvas` JSON into a `FlowImpl` that builds
a `Map<id, node>` (excluding `link` nodes, tagging `.js` nodes with `extension:"js"`) and exposes
graph traversal: `rootNodes()`, `childrensOf(id)`, `parentsOf(id)`, `get(id)`, `editTextNode()`.
Node config round-trips through `YamlService`/`FrontmatterService` (`zettelflowConfig`).

## 6. Custom view — `CodeView`

`architecture/components/core/codeView/CodeView.ts` — `CodeView extends TextFileView`, a
CodeMirror-based editor registered for the **`.js`** extension (`NAME = "ZettelFlowCodeView"`,
`EXTENSIONS = ["js"]`). Registration is wrapped in try/catch because another plugin may already
own `.js`. On load it reads content via `FileService`, mounts the editor with `dispatchEditor`,
and debounces saves by 1000 ms.

## 7. Obsidian API facade & scripting API

- **`ObsidianAPIService`** (`plugin/ObsidianAPI.ts`) — `ObsidianApi` singleton wrapping `app`:
  `vault()`, `workspace()`, `fileManager()`, `metadataCache()`, `executeCommandById()`,
  `getOwnPlugin()`, `getExternalPlugin(id)`. Prefer this over touching `app` directly.
- **`fnsManager`** (`api/lib/FnConstructor.ts`) — builds and caches the `zf` scripting object
  injected into Script actions and property hooks: `external` integrates Templater (`tp`) and
  Dataview (`dv`) if installed; `internal` merges `ZfVault` (vault helpers) and `ZfScripts`
  (user `.js` library under `jsLibraryFolderPath`). `invalidateCache()` clears it.

## 8. Logging — `architecture/monitoring/Logger.ts`

`log` is a level-gated singleton (`trace`>`debug`>`info`>`warn`>`error`). `configureLogger()`
rebinds each method to `console.*` **only when** `isDebugModeEnabled` **and** the level is high
enough. Configured from settings at load (`log.setDebugMode`, `log.setLevelInfo`).

> ⚠️ Because every level requires debug mode, **`log.error` is silenced when logging is off**.
> Consider always allowing `error`.

## 9. Internationalization — `architecture/lang/`

`t(key, ...args)` reads Obsidian's language from `localStorage['language']`, maps to `en`/`es`
locale objects (default `en`), falls back to `en` per-key, does positional `{0}`/`{1}`
interpolation, and returns the raw key (with a warning) if missing everywhere. `es.ts` is
`Partial<typeof en>` and slightly behind `en.ts` — keep both in sync, and remember that UI
strings must be **sentence case** for the Obsidian review.

## 10. React & state — patterns

- **Mounting:** each modal/view holds a `Root` from `react-dom/client`, `render`s on open and
  `unmount`s on close. `SelectorMenuModal` is the canonical example. React 19; only the note
  builder wraps its tree in `<StrictMode>`.
- **State:** Zustand (`useNoteBuilderStore`) is used *only* for the wizard. All other shared
  state is a `private static instance` + `getInstance()` singleton (`ActionsStore`,
  `CanvasImpl`, `ObsidianAPIService`, `FnsManager`, `ZComponentsManagerService`, `Log`,
  `VaultStateManager`).
