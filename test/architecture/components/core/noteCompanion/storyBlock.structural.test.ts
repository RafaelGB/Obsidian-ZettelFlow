import { describe, it, expect } from "@jest/globals";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const COMPANION = join(__dirname, "..", "..", "..", "..", "..", "src/architecture/components/core/noteCompanion");
const read = (rel: string) => readFileSync(join(COMPANION, rel), "utf8");

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        return statSync(full).isDirectory() ? sources(full) : [full];
    });
}

/**
 * The story reads the companion's note (#640 risk 1, #642).
 *
 * In a sidebar, the active leaf is the sidebar; and a pinned companion is about a note you may not
 * be looking at. So the story — its strands, its share — reads the note it is given, never the
 * workspace's active file. And it is a block of the companion, not a view of its own: no heading,
 * no refresh and no toggle of its own (AC-12).
 */
describe("the story follows the companion's note (#640, #642)", () => {
    it("never asks the workspace which file is active when it reads or shares", () => {
        for (const file of ["storySource.ts", "shareIdeaCard.ts", "blocks/storyBlock.ts", "storyRows.ts"]) {
            expect({ file, uses: read(file).includes("getActiveFile") }).toEqual({ file, uses: false });
        }
    });

    it("nothing in the companion asks for the active editor", () => {
        for (const file of sources(COMPANION)) {
            expect({ file, uses: readFileSync(file, "utf8").includes("getActiveViewOfType") }).toEqual({
                file,
                uses: false,
            });
        }
    });

    it("has no heading, refresh or toggle of its own", () => {
        const block = read("blocks/storyBlock.ts");
        expect(block).not.toMatch(/createEl\("h[1-6]"/);
        expect(block).not.toMatch(/ctx\.refresh|refresh-cw|_refresh/);
        expect(block).not.toContain("evolution_timeline_filter_");
    });
});
