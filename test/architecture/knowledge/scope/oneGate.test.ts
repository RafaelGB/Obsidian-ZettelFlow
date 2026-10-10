import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";

const SRC = join(__dirname, "..", "..", "..", "..", "src");

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return sources(full);
        return /\.tsx?$/.test(entry) ? [full] : [];
    });
}

/**
 * Every caller asks the one gate (#713, risk 2).
 *
 * Eight places used to match excluded folders themselves. A tag or property rule would silently not
 * apply to any one of them that was missed — a note left out everywhere else, still judged, captured
 * or offered there. So the folder predicate may be used only where a folder is genuinely the
 * question: inside the scope module, the move log's deliberate Thinking-space exception, and
 * Obsidian's own config folder (which is never a note) in `main.ts` and Cultivate's inquiry.
 */
describe("one scope gate, and every caller asks it (#713)", () => {
    const files = sources(SRC).map((path) => ({ path: relative(SRC, path).split(sep).join("/"), text: readFileSync(path, "utf8") }));

    it("reads the whole of src", () => {
        expect(files.length).toBeGreaterThan(400);
    });

    it("has no merged user-and-system list left to bypass the rules with", () => {
        expect(files.filter(({ text }) => /\bscopeExcludedPaths\b/.test(text)).map(({ path }) => path)).toEqual([]);
    });

    it("uses the folder predicate only where a folder is the question", () => {
        const allowed = new Set([
            "main.ts",
            "architecture/plugin/thinking/MoveLog.ts",
            // The same thinking-space exception as MoveLog: a verdict on a thought is kept (#748 G1).
            "architecture/plugin/judgement/JudgementLog.ts",
            "architecture/components/core/cultivate/CultivateModeRenderer.ts",
            // The barrel re-exports it for the one view above.
            "architecture/knowledge/state/index.ts",
            // Names it only to decline exposing it to scripts.
            "architecture/api/lib/knowledge/knowledgeApi.ts",
        ]);
        const users = files
            .filter(({ path }) => !path.startsWith("architecture/knowledge/scope/"))
            .filter(({ text }) => /\bisPathExcluded\b|\bexcludedPrefixOf\b/.test(text))
            .map(({ path }) => path)
            .filter((path) => !allowed.has(path));
        expect(users).toEqual([]);
    });

    it("still has the gate being asked, or the rule would be vacuous", () => {
        const askers = files.filter(({ text }) => /\binScopeFor\(|KnowledgeIndex\.getInstance\(\)\.inScope\(|index\.inScope\(/.test(text));
        expect(askers.length).toBeGreaterThanOrEqual(5);
    });
});
