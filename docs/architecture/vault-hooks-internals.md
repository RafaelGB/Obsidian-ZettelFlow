# Vault hooks internals

> This is the **developer** view of the hooks subsystem (`src/hooks/`). For the **user** guide
> to configuring property hooks and folder automation, see
> [Vault Hooks](../vault-hooks/property-hooks/overview.md) and
> [Folder Automation](../vault-hooks/OnCreate.md).

`Hooks.setup(plugin)` (called from `main.ts`) wires four sub-features:

```ts
FileMenu.setup(plugin);      // context menus on files/folders
EditorMenu.setup(plugin);    // editor context menu + command
VaultHooks.setup(plugin);    // the vault-event engine (this file)
CanvasNodeMenu.setup(plugin); // canvas node context menu
```

> Note: `src/hooks/` (vault events) is **not** the same as `src/architecture/hooks/` (React
> hooks like `useOnClickAway`).

## The event engine — `hooks/VaultHooks.ts`

On `workspace.onLayoutReady`, it `registerEvent`s against:

- **vault:** `create`, `rename`, `delete`, `modify`
- **metadataCache:** `changed`
- **workspace:** `file-open`

Every handler early-returns if `VaultStateManager.INSTANCE.isFreezed()` — this prevents feedback
loops when the plugin itself is writing to the vault.

### Folder automation (`onCreate`)

When a file is created, it computes the canvas path for the **parent folder** via
`canvasPathFromFolder(settings.foldersFlowsPath, parent.path)`. If that `.canvas` exists, it
loads the flow and opens the step-selector modal. → *A folder with an associated flow
auto-launches it on every new note.*

### Housekeeping handlers

- **`rename`** — folder rename renames the paired canvas; file rename keeps the `ribbonCanvas` /
  `jsLibraryFolderPath` setting pointers in sync.
- **`delete`** — folder delete removes its paired canvas and clears `jsLibraryFolderPath`; file
  delete clears `ribbonCanvas`. Invalidates the flow cache.
- **`modify`** — invalidates the `canvas.flows` cache for `.canvas` files.
- **`file-open`** — registers the opened markdown file into `VaultStateManager` (snapshots its
  frontmatter for later diffing).

## Property hooks (`metadataCache "changed"`)

This is the "run JS when a property changes" feature (`onCacheUpdate` / `processMetadataChange`):

1. **Debounce** per file by `METADATA_DEBOUNCE_MS = 60ms`; skip non-`.md` and files already
   `isOnProcess`.
2. Read the property→hook map from `settings.hooks.properties`; if empty, return.
3. **Diff** old vs new frontmatter per configured property (`valuesEqual`, a JSON deep-equal).
   On a change, build a `HookEvent`.
4. **Run the script** (`executeHook`): the hook's JS is wrapped in an `AsyncFunction` invoked as
   `scriptFn(event, zf)`, where `event` is mutable and `zf = await fnsManager.getFns()`. The user
   script mutates `event.response.frontmatter` / `event.response.removeProperties` /
   `event.response.flowToTrigger`.
5. **Write back** any mutations via `FrontmatterService.setProperties(...)`, guarded by
   `VaultStateManager.processStart/processFinished` to prevent re-entrancy.
6. **Optional flow trigger:** if the script set `flowToTrigger` and the file is active, resolve
   `canvasPathFromFlowName(hooks.folderFlowPath, name)` and open that flow's selector.
7. Frontmatter cache is revoked after `FRONTMATTER_CACHE_TTL_MS = 60_000ms`.

### Hook type contract (`hooks/typing.ts`)

```ts
type HookRequest  = { oldValue; newValue; property; frontmatter };
type HookResponse = { frontmatter; removeProperties; flowToTrigger? };
type HookEvent    = { request: HookRequest; response: HookResponse; file };
type HookSettings = { script: string };
type HooksConfig  = { folderFlowPath: string; properties: Record<string, HookSettings> };
```

### Config UI

The **Hooks** settings section renders a React `PropertyHooksManager` — a `@dnd-kit` sortable
list of per-property hooks, each with a CodeMirror editor (with hook-specific autocomplete in
`hooks/extensions/autoconfiguration/`), add/edit/delete, and uuid-v7 keys. It loads Obsidian's
native property types via `ObsidianNativeTypesManager.getAllTypes()` and saves to
`plugin.settings.hooks.properties`. A `FoldersFlowSelectorHandler` binds a folder-suggest to
`settings.hooks.folderFlowPath`.

## Menu integrations

- **`FileMenu`** — folder menu "Edit folder workflow"; markdown-file menu to
  transform/edit/remove/copy/paste a note's step config; `.canvas` cache invalidation.
- **`EditorMenu`** — editor context menu + `editor-menu-flow` command to open the `editorCanvas`
  flow selector.
- **`CanvasNodeMenu`** — `canvas:node-menu` items to edit/copy/paste embedded step config on
  ZettelFlow canvases.

## `VaultStateManager`

A singleton (`architecture/plugin`) that (a) snapshots per-file frontmatter so property hooks can
diff old vs new, and (b) exposes a **freeze** flag (`isFreezed` / `processStart` /
`processFinished`) that hook handlers check to avoid reacting to the plugin's own writes.

## See also

[Event-driven workflows](event-driven-workflows.md) build on the same vault/metadata signals and
the same `VaultStateManager` freeze state, but bind a whole **flow** (not just a script) to an
event — off by default, throttled, and loop-guarded.
