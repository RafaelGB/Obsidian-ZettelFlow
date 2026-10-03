import { describe, it, expect } from "@jest/globals";
import { OBSIDIAN_LOCALE } from "architecture/lang";
import { absoluteDay, monthHeading } from "architecture/components/core/noteCompanion/storyFormat";

/**
 * The story's dates are in Obsidian's language (#639 runtime audit). Intl's own default is the
 * operating system's, which in Electron need not be Obsidian's.
 */
describe("story dates", () => {
    it("default to Obsidian's language, not the platform's", () => {
        const lang = OBSIDIAN_LOCALE || "en";
        expect(monthHeading(2026, 9)).toBe(monthHeading(2026, 9, lang));
        expect(absoluteDay(new Date(2026, 9, 3).getTime())).toBe(absoluteDay(new Date(2026, 9, 3).getTime(), lang));
    });

    it("read in Spanish when Obsidian is in Spanish", () => {
        expect(monthHeading(2026, 9, "es")).toBe("octubre de 2026");
        expect(absoluteDay(new Date(2026, 9, 3).getTime(), "es")).toBe("3 de octubre de 2026");
    });
});
