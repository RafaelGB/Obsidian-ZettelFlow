/**
 * Minimal manual mock of the Obsidian API for unit tests.
 *
 * Obsidian is provided by the host app at runtime and is marked `external` in the build,
 * so it is not a real runnable module. This stub lets pure logic (and, later, lightly
 * Obsidian-coupled code) be unit-tested. Extend it as tests need more surface.
 */

export type HexString = string;
export interface RGB {
  r: number;
  g: number;
  b: number;
}

export class Notice {
  constructor(public message?: string) {}
  setMessage(message: string): this {
    this.message = message;
    return this;
  }
  hide(): void {}
}

export class Plugin {}
export class Modal {}
export class TAbstractFile {
  path = "";
  name = "";
}
export class TFile extends TAbstractFile {
  extension = "md";
  basename = "";
}
export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = [];
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}

export function requireApiVersion(_version: string): boolean {
  return true;
}

/**
 * Minimal YAML parser covering the flat `key: value` subset that ZettelFlow's
 * canvas node configs use (booleans, numbers, strings). Enough for `YamlService`
 * (`isRoot()` / `getZettelFlowSettings()`) under test; not a general YAML engine.
 */
export function parseYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!yaml) return result;
  for (const rawLine of yaml.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const raw = line.slice(separator + 1).trim();
    if (raw === "true") {
      result[key] = true;
    } else if (raw === "false") {
      result[key] = false;
    } else if (raw !== "" && !Number.isNaN(Number(raw))) {
      result[key] = Number(raw);
    } else {
      result[key] = raw;
    }
  }
  return result;
}

/** Minimal counterpart to `parseYaml` — serialises a flat record to `key: value` lines. */
export function stringifyYaml(value: Record<string, unknown>): string {
  if (!value) return "";
  return Object.entries(value)
    .map(([key, val]) => `${key}: ${String(val)}`)
    .join("\n")
    .concat("\n");
}
