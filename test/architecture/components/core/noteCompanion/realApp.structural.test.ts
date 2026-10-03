import { describe, it, expect } from "@jest/globals";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const COMPANION = join(ROOT, "src/architecture/components/core/noteCompanion");

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        return statSync(full).isDirectory() ? sources(full) : [full];
    });
}

/**
 * What only the real app enforces (#639 runtime audit): the jest DOM has no layout, no popout
 * windows, no deferred leaves and no layout restore, so these are held by reading the code.
 */
describe("the companion behaves in the real app", () => {
    it("never calls scrollIntoView, which scrolls Obsidian's own panes too", () => {
        for (const file of sources(COMPANION)) {
            expect({ file, uses: readFileSync(file, "utf8").includes("scrollIntoView(") }).toEqual({ file, uses: false });
        }
    });

    it("opens its menus in the window the button is in", () => {
        expect(read("src/architecture/components/core/noteCompanion/blocks/headBlock.ts")).toContain("more.doc)");
        expect(read("src/architecture/components/core/surface/ModeHeader.ts")).toContain("trigger.doc)");
    });

    it("loads a deferred leaf before handing it state", () => {
        const opener = read("src/architecture/components/core/noteCompanion/openNoteCompanion.ts");
        expect(opener.indexOf("loadIfDeferred")).toBeGreaterThan(-1);
        expect(opener.indexOf("loadIfDeferred")).toBeLessThan(opener.indexOf("existing.setViewState"));
    });

    it("hands a retired leaf over only once the layout is ready", () => {
        const redirect = read("src/architecture/components/core/surface/LegacyRedirectView.ts");
        expect(redirect).toMatch(/onLayoutReady\(\(\) => \{\s*this\.leaf\.detach\(\);\s*void openNoteCompanion/);
    });

    it("does not submit on an Enter that ends an IME composition", () => {
        expect(read("src/architecture/components/core/noteCompanion/blocks/nextStepBlock.ts")).toContain("!event.isComposing");
    });

    it("uses no icon id renamed upstream", () => {
        expect(read("src/architecture/components/core/noteCompanion/storyRows.ts")).not.toContain('"arrow-up-circle"');
    });
});
