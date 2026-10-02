import { describe, it, expect } from "@jest/globals";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const TIMELINE = readFileSync(
    join(ROOT, "src/architecture/components/core/timeline/EvolutionTimelineRenderer.ts"),
    "utf8"
);
const COMPANION = join(ROOT, "src/architecture/components/core/noteCompanion");

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        return statSync(full).isDirectory() ? sources(full) : [full];
    });
}

/** The body of a method, from its signature to the next method at the same indent. */
function method(source: string, name: string): string {
    const start = source.search(new RegExp(`\\n    (?:private |public )?(?:async )?${name}\\(`));
    expect(start).toBeGreaterThan(-1);
    const rest = source.slice(start + 1);
    const end = rest.slice(1).search(/\n    (?:private |public |protected )?(?:async )?[a-zA-Z]+\(/);
    return end < 0 ? rest : rest.slice(0, end + 1);
}

/**
 * The history shows the companion's note (#640 FR-17, risk 1).
 *
 * In a sidebar, the active leaf is the sidebar; and a pinned companion is about a note you may not
 * be looking at. So the history reads the note it is given, never the workspace's active file.
 */
describe("the history follows the companion's note (#640)", () => {
    it("takes the note it shows from an injected subject", () => {
        expect(TIMELINE).toContain("subject: (() => string | null)");
    });

    it("never asks the workspace which file is active when it reads or shares", () => {
        expect(method(TIMELINE, "recompute")).not.toContain("getActiveFile");
        expect(method(TIMELINE, "shareIdeaCard")).not.toContain("getActiveFile");
    });

    it("nothing in the companion asks for the active editor", () => {
        for (const file of sources(COMPANION)) {
            expect({ file, uses: readFileSync(file, "utf8").includes("getActiveViewOfType") }).toEqual({
                file,
                uses: false,
            });
        }
    });
});
