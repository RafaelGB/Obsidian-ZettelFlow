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
