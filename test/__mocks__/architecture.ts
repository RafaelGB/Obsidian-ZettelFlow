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

// ─── ObsidianApi stub ─────────────────────────────────────────────────────────
// Module-level vars so individual tests can wire their own vault/metadataCache
// via __setMockObsidianApi without needing the real ObsidianAPIService singleton.
let _vault: Record<string, unknown> | null = null;
let _metadataCache: Record<string, unknown> | null = null;

export const ObsidianApi = {
  vault: () => _vault,
  metadataCache: () => _metadataCache,
  fileManager: (): never => undefined as never,
  workspace: (): never => undefined as never,
};

/** Call this in wireApp / beforeEach to configure ObsidianApi for the current test. */
export function __setMockObsidianApi(opts: {
  vault?: Record<string, unknown> | null;
  metadataCache?: Record<string, unknown> | null;
}) {
  if (opts.vault !== undefined) _vault = opts.vault;
  if (opts.metadataCache !== undefined) _metadataCache = opts.metadataCache;
}
