import { describe, it, expect } from "@jest/globals";
import { normalizeLibrary, withPlace, withScroll, resumeScroll } from "application/library/sourceMeta";

describe("resuming where you were inside a chapter, not at its start", () => {
    it("keeps how far into the chapter you are, as a share of it", () => {
        let map = withPlace({}, "a.epub", 3, 10, 1, 10, 20);
        map = withScroll(map, "a.epub", 3, 0.42);
        expect(map["a.epub"]).toMatchObject({ chapter: 3, scroll: 0.42 });
        expect(normalizeLibrary(JSON.parse(JSON.stringify(map)))["a.epub"].scroll).toBe(0.42);
    });

    it("forgets the share when you turn to another chapter", () => {
        let map = withScroll(withPlace({}, "a.epub", 3, 10, 1, 10, 20), "a.epub", 3, 0.42);
        map = withPlace(map, "a.epub", 4, 10, 2, 10, 20);
        expect(map["a.epub"].scroll).toBeUndefined();
    });

    it("never keeps a share for a chapter you are not on, nor one out of range", () => {
        const map = withPlace({}, "a.epub", 3, 10, 1, 10, 20);
        expect(withScroll(map, "a.epub", 5, 0.5)["a.epub"].scroll).toBeUndefined();
        expect(normalizeLibrary({ "a.epub": { size: 1, mtime: 1, chapter: 0, scroll: 7 } })["a.epub"].scroll).toBeUndefined();
    });

    it("lands on the same share of the page, whatever its height now", () => {
        expect(resumeScroll(0.5, 3000, 1000)).toBe(1000);
        expect(resumeScroll(0, 3000, 1000)).toBe(0);
        expect(resumeScroll(0.9, 800, 1000)).toBe(0); // a page that fits has nowhere to go
    });
});
