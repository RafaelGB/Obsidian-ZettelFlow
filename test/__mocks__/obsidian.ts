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
