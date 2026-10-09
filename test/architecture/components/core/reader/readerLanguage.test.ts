import { describe, it, expect } from "@jest/globals";
import { languageName, languageTag, readingLanguage } from "architecture/components/core/reader/readerLanguage";

describe("the language the page declares (#757 AC-3, FR-6)", () => {
    it("is an EPUB's own, a chapter's overriding the book's", () => {
        expect(readingLanguage({ format: "epub", bookLanguage: "es" })).toBe("es");
        expect(readingLanguage({ format: "epub", bookLanguage: "es", chapterLanguage: "ca" })).toBe("ca");
        expect(readingLanguage({ format: "epub", chapterLanguage: "fr" })).toBe("fr");
    });

    it("is a PDF's declaration when it has one", () => {
        expect(readingLanguage({ format: "pdf", bookLanguage: "de-DE" })).toBe("de-DE");
        expect(readingLanguage({ format: "pdf" })).toBeNull();
    });

    it("is nothing for a note reading, which keeps Obsidian's as today", () => {
        expect(readingLanguage({ format: "note" })).toBeNull();
        expect(readingLanguage({ format: "note", bookLanguage: "es" })).toBeNull();
    });

    it("declares nothing for a tag that is not one", () => {
        expect(readingLanguage({ format: "epub", bookLanguage: "x y" })).toBeNull();
        expect(readingLanguage({ format: "epub", bookLanguage: "es", chapterLanguage: "<b>" })).toBe("es");
        expect(languageTag("  en-GB ")).toBe("en-GB");
        expect(languageTag("")).toBeUndefined();
        expect(languageTag(42)).toBeUndefined();
    });
});

describe("its name, from the platform in the reader's language (#757 FR-7, FR-12)", () => {
    it("names it in the language of the interface", () => {
        expect(languageName("es", "en")).toBe("Spanish");
        expect(languageName("es", "es")).toBe("español");
    });

    it("falls back to the tag when the platform does not know it", () => {
        expect(languageName("qqq", "en")).toBe("qqq");
        expect(languageName("x y", "en")).toBe("x y");
    });
});
