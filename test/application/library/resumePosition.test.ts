import { describe, it, expect } from "@jest/globals";
import { normalizeLibrary, withFacts, withPageView, withPlace, withScroll, resumeScroll } from "application/library/sourceMeta";

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

describe("how a paper is read in Page view is kept with its place (#767 AC-4)", () => {
    it("round-trips the zoom, the fit, the direction and the turned pages", () => {
        let map = withPlace({}, "p.pdf", 2, 10, 1, 10, 20);
        map = withPageView(map, "p.pdf", { zoom: 1.5, across: true, rotate: { 3: 90 } });
        const read = normalizeLibrary(JSON.parse(JSON.stringify(map)))["p.pdf"];
        expect(read.view).toEqual({ zoom: 1.5, across: true, rotate: { 3: 90 } });
        expect(normalizeLibrary(JSON.parse(JSON.stringify(withPageView(map, "p.pdf", { fit: "page" }))))["p.pdf"].view).toEqual({ fit: "page" });
    });

    it("reads a malformed view as the default, and leaves no field for the default", () => {
        expect(normalizeLibrary({ "p.pdf": { size: 1, mtime: 1, view: { zoom: "x", rotate: { 3: 45 } } } })["p.pdf"].view).toBeUndefined();
        expect(withPageView(withPlace({}, "p.pdf", 0, 3, 1), "p.pdf", {})["p.pdf"].view).toBeUndefined();
    });

    it("keeps the view through a turn, a scroll and a new copy of the file", () => {
        let map = withPageView(withPlace({}, "p.pdf", 0, 10, 1, 10, 20), "p.pdf", { zoom: 2 });
        map = withPlace(map, "p.pdf", 4, 10, 2, 10, 20);
        map = withScroll(map, "p.pdf", 4, 0.3);
        map = withFacts(map, "p.pdf", { chapters: 10 }, 11, 21);
        expect(map["p.pdf"].view).toEqual({ zoom: 2 });
    });
});
