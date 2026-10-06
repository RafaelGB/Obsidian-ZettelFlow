import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

// test/architecture → 2 ups → repo root
const SRC = join(__dirname, "..", "..", "src");

function collect(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collect(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Regression guard (#680). Obsidian's `View.open(containerEl)` is what calls `onOpen()`, and
 * `View.close()` what calls `onClose()`. A view declaring its own `open(...)`/`close(...)` shadows
 * them: the Library had a `private open(item)`, so Obsidian's open ran ours, `onOpen` never ran, and
 * the tab stayed blank with no error. The jest `ItemView` fake has no `open`, so only this catches it.
 */
describe("no view shadows Obsidian's open/close (#680)", () => {
  it("never declares open(...) or close(...) in a class extending a View", () => {
    const offenders: string[] = [];
    for (const file of collect(SRC)) {
      const text = readFileSync(file, "utf8");
      if (!/class\s+\w+\s+extends\s+(ItemView|FileView|TextFileView|EditableFileView|View)\b/.test(text)) continue;
      if (/^\s*(private |protected |public )?(async )?(open|close)\s*\(/m.test(text)) offenders.push(file.replace(SRC, "src"));
    }
    expect(offenders).toEqual([]);
  });
});
