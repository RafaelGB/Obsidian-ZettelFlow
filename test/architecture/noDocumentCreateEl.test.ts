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
 * Regression guard (#327). Obsidian's `createEl` **appends the new element to its receiver**. Calling it
 * on `document`/`activeDocument` therefore appends a second element to the document, throwing
 * "appendChild: Only one element on document allowed" and unmounting any surrounding React tree — the
 * add-hook crash. Use native `document.createElement(...)` (detached) instead. This test fails if the
 * anti-pattern reappears anywhere in `src`.
 */
describe("no createEl on the document node (#327)", () => {
  it("never calls (active)document.createEl(...)", () => {
    const offenders: string[] = [];
    for (const file of collect(SRC)) {
      const text = readFileSync(file, "utf8");
      if (/\b(activeDocument|document)\.createEl\s*\(/.test(text)) {
        offenders.push(file.replace(SRC, "src"));
      }
    }
    expect(offenders).toEqual([]);
  });
});
