import { describe, it, expect } from "@jest/globals";
import { DOTS_MAX, chapterState, kickerTitle, screenPart, showDots } from "architecture/components/core/reader/readerProgress";

describe("one progress signal (#812)", () => {
    it("shows dots for a reading of twelve chapters or fewer, whatever it reads (FR-16)", () => {
        expect(DOTS_MAX).toBe(12);
        expect(showDots(8)).toBe(true);
        expect(showDots(12)).toBe(true);
        expect(showDots(13)).toBe(false);
        expect(showDots(30)).toBe(false);
        expect(showDots(1)).toBe(false);
    });

    it("reads each chapter's state from the place and this sitting, never a new record (FR-13)", () => {
        const visited = new Set([7]);
        expect(chapterState(2, 4, visited)).toBe("read");
        expect(chapterState(4, 4, visited)).toBe("part");
        expect(chapterState(7, 4, visited)).toBe("part");
        expect(chapterState(9, 4, visited)).toBe("unread");
        expect(chapterState(9, 4, visited, true)).toBe("read");
    });

    it("says the chapter's title above the text, but never twice and never a number (FR-15)", () => {
        expect(kickerTitle("01. Principios básicos", "Principios basicos")).toBe("");
        // A heading broken over two lines reads as one: "01" and "Principios básicos".
        expect(kickerTitle("01. Principios básicos", "01Principios básicos")).toBe("");
        expect(kickerTitle("Introducción. La lente de los sistemas", "Introducción")).toBe("");
        expect(kickerTitle("Nota de la autora", "")).toBe("Nota de la autora");
        expect(kickerTitle("3 · The lazy controller", "A general law")).toBe("3 · The lazy controller");
        expect(kickerTitle(null, "Anything")).toBe("");
        expect(kickerTitle("   ")).toBe("");
    });

    it("names the screen within a chapter in pages, and nothing when it fits one (FR-18)", () => {
        expect(screenPart(1, 3)).toEqual({ at: 2, of: 3 });
        expect(screenPart(0, 1)).toBeNull();
        expect(screenPart(9, 3)).toEqual({ at: 3, of: 3 });
    });
});
