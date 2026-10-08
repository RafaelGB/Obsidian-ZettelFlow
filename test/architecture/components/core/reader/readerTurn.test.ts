import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { endChapterTurn, playChapterTurn } from "architecture/components/core/reader/readerTurn";

const VIEW = readFileSync(join(__dirname, "..", "..", "..", "..", "..", "src", "architecture", "components", "core", "reader", "ReaderView.ts"), "utf8");

/** A chapter changes physically (#735, epic #729): a sheet, never a dissolve — and never in the way. */
describe("a chapter changes physically (#735)", () => {
    it("plays nothing where motion is not welcome: the next chapter simply is there", () => {
        const still = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 800 }) } as unknown as HTMLElement;
        for (const motion of ["leaf", "flow", "stack"] as const) expect(playChapterTurn(still, still, still, motion, 1)).toBe(false);
        expect(() => endChapterTurn()).not.toThrow();
    });

    it("lays the sheet before the page is emptied, in both kinds of chapter", () => {
        // The sheet is a picture of the page you were on: taken after `empty()` it would be blank.
        const turns = [...VIEW.matchAll(/this\.turnFrom\(page\);\s*\n\s*page\.empty\(\);/g)];
        expect(turns).toHaveLength(2);
    });

    it("reads the chosen motion from Settings → Reading", () => {
        expect(VIEW).toContain("readingMotion(this.plugin?.settings?.readingMotion).chapter");
    });
});
