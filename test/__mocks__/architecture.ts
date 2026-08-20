// Lightweight stub of the `architecture` barrel for unit tests (avoids loading the whole
// framework, which pulls in Obsidian-coupled modules).
export const log = {
  trace: () => undefined,
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  setDebugMode: () => undefined,
  setLevelInfo: () => undefined,
};

export const c = (...classes: string[]): string =>
  classes.map((cls) => `zettelkasten-flow__${cls}`).join(" ");

// Minimal PluginComponent base so ZComponents can be imported/unit-tested without the real barrel.
export abstract class PluginComponent {
  constructor(_plugin: unknown) {}
  abstract onLoad(): void;
  onUnload(): void {}
}

// ─── ObsidianApi stub ─────────────────────────────────────────────────────────
// Module-level vars so individual tests can wire their own vault/metadataCache
// via __setMockObsidianApi without needing the real ObsidianAPIService singleton.
let _vault: Record<string, unknown> | null = null;
let _metadataCache: Record<string, unknown> | null = null;
let _fileManager: Record<string, unknown> | null = null;
// Default own-plugin stub exposes the Component lifecycle hooks code registers listeners/teardown
// with (registerEvent/register); no-ops so tests that don't care aren't forced to wire it.
let _ownPlugin: Record<string, unknown> = {
  registerEvent: () => undefined,
  register: () => undefined,
};

export const ObsidianApi = {
  vault: () => _vault,
  metadataCache: () => _metadataCache,
  fileManager: () => _fileManager,
  getOwnPlugin: () => _ownPlugin,
  workspace: (): never => undefined as never,
};

/** Call this in wireApp / beforeEach to configure ObsidianApi for the current test. */
export function __setMockObsidianApi(opts: {
  vault?: Record<string, unknown> | null;
  metadataCache?: Record<string, unknown> | null;
  fileManager?: Record<string, unknown> | null;
  ownPlugin?: Record<string, unknown>;
}) {
  if (opts.vault !== undefined) _vault = opts.vault;
  if (opts.metadataCache !== undefined) _metadataCache = opts.metadataCache;
  if (opts.fileManager !== undefined) _fileManager = opts.fileManager;
  if (opts.ownPlugin !== undefined) _ownPlugin = opts.ownPlugin;
}
