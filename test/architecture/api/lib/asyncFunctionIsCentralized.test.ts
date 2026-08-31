import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";

// test/architecture/api/lib → 4 ups → repo root
const SRC = join(__dirname, "..", "..", "..", "..", "src");
const FN_CONSTRUCTOR = join("architecture", "api", "lib", "FnConstructor.ts");

/**
 * The Obsidian Community-hub scan flags **dynamic code execution** (#340). It is a real, headline
 * capability here — the Script action, dynamic selectors, vault hooks and workflow-event conditions
 * all run user JS — so it cannot be removed. What it *can* be is **stated precisely**: exactly one
 * module reaches the hidden `AsyncFunction` constructor, so the disclosure names one place and a
 * reviewer has one place to audit (constitution §VII, and §XI: one home per job).
 */
function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
        else if (/\.tsx?$/.test(entry)) out.push(full);
    }
    return out;
}

describe("AsyncFunction construction is centralized (#340)", () => {
    const files = sourceFiles(SRC);

    it("finds the source tree", () => {
        expect(files.length).toBeGreaterThan(100);
    });

    it("reaches the AsyncFunction constructor in FnConstructor only", () => {
        const offenders = files
            .filter((file) => /Object\.getPrototypeOf\(\s*async function/.test(readFileSync(file, "utf8")))
            .map((file) => relative(SRC, file).split(sep).join("/"));

        expect(offenders).toEqual([FN_CONSTRUCTOR.split(sep).join("/")]);
    });

    it("builds runtime scripts through buildAsyncScriptFunction only", () => {
        const offenders = files
            .filter((file) => !file.endsWith(FN_CONSTRUCTOR))
            .filter((file) => /new AsyncFunction\(/.test(readFileSync(file, "utf8")))
            .map((file) => relative(SRC, file).split(sep).join("/"));

        expect(offenders).toEqual([]);
    });
});
