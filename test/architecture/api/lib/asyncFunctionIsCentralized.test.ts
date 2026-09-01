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
 * module reaches a function constructor, so the disclosure names one place and a reviewer has one
 * place to audit (constitution §VII, and §XI: one home per job).
 *
 * This guardrail used to match `async function` only, while `ZfScripts` built a **synchronous**
 * `Function` to wrap library modules — so it passed while the claim in the user-facing capability
 * disclosure was false, and one grep for `Object.getPrototypeOf(function` disproved it (#320). It now
 * matches either form: a guardrail that only checks the half you remembered is worse than none,
 * because it converts an unchecked claim into a checked-looking one.
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

    it("reaches a function constructor in FnConstructor only, sync or async", () => {
        const offenders = files
            .filter((file) => /Object\.getPrototypeOf\(\s*(async\s+)?function/.test(readFileSync(file, "utf8")))
            .map((file) => relative(SRC, file).split(sep).join("/"));

        expect(offenders).toEqual([FN_CONSTRUCTOR.split(sep).join("/")]);
    });

    it("builds runtime scripts through the two exported builders only", () => {
        const offenders = files
            .filter((file) => !file.endsWith(FN_CONSTRUCTOR))
            .filter((file) => /new (Async)?Function\(/.test(readFileSync(file, "utf8")))
            .map((file) => relative(SRC, file).split(sep).join("/"));

        expect(offenders).toEqual([]);
    });
});
