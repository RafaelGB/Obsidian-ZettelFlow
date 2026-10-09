import { describe, it, expect } from "@jest/globals";
import {
    dragDirection,
    edgeTurn,
    forwardSign,
    keyIntent,
    pageCount,
    pageForShare,
    pageGeometry,
    pageShape,
    DEFAULT_PAGE_SHAPE,
    pageHolding,
    scrollTopFor,
    shareOfPage,
    spreadFits,
    stripOffset,
    viewCount,
} from "architecture/components/core/reader/readerPages";
import { releaseTurn, rubberBand } from "architecture/components/core/reader/readerGestures";

describe("whether a spread fits (#753 AC-4, FR-3)", () => {
    it("needs two pages of 45 characters and their gaps", () => {
        expect(spreadFits(1400, 9, 32)).toBe(true);
        expect(spreadFits(800, 9, 32)).toBe(false);
        // Exactly enough: 2 × 45ch and three gaps.
        expect(spreadFits(2 * 45 * 9 + 96, 9, 32)).toBe(true);
        expect(spreadFits(2 * 45 * 9 + 95, 9, 32)).toBe(false);
    });

    it("shows one page where it does not fit, and the choice is still Spread", () => {
        expect(pageGeometry({ layout: "spread", width: 800, chPx: 9 })).toMatchObject({ perView: 1, spread: false });
        expect(pageGeometry({ layout: "spread", width: 1400, chPx: 9 })).toMatchObject({ perView: 2, spread: true });
    });

    it("keeps the measure, and puts the pages before and after exactly off screen", () => {
        const one = pageGeometry({ layout: "page", width: 1000, chPx: 9 });
        expect(one.columnPx).toBe(612);
        // The gap beside the page is the gap between pages: the next page starts at the right edge.
        expect(one.gapPx * 2 + one.columnPx).toBeCloseTo(1000, 5);
        expect(one.gapPx + one.stridePx).toBeCloseTo(1000, 5);
        const two = pageGeometry({ layout: "spread", width: 1400, chPx: 9 });
        expect(two.gapPx * 3 + two.columnPx * 2).toBeCloseTo(1400, 5);
        expect(two.viewPx).toBeCloseTo(two.columnPx * 2 + two.gapPx, 5);
        // A narrow reading: the page is as wide as the screen allows.
        expect(pageGeometry({ layout: "page", width: 400, chPx: 9 }).columnPx).toBe(400 - 64);
    });
});

describe("how many pages, and which one holds a place (#753 AC-5)", () => {
    it("counts the pages of a strip, at least one", () => {
        expect(pageCount(600, 700, 100)).toBe(1);
        expect(pageCount(600 + 700 * 9, 700, 100)).toBe(10);
        expect(pageCount(0, 700, 100)).toBe(1);
        expect(viewCount(9, 2)).toBe(5);
        expect(viewCount(10, 1)).toBe(10);
    });

    it("finds the screen holding an offset, at page boundaries, for one page and for a spread", () => {
        expect(pageHolding(0, 700, 1, 10)).toBe(0);
        expect(pageHolding(699, 700, 1, 10)).toBe(0);
        expect(pageHolding(700, 700, 1, 10)).toBe(1);
        expect(pageHolding(700 * 3 + 5, 700, 2, 5)).toBe(1);
        expect(pageHolding(700 * 4, 700, 2, 5)).toBe(2);
        // Past the end, the last screen.
        expect(pageHolding(1e9, 700, 1, 10)).toBe(9);
    });

    it("lands a share of the chapter on its screen, and back again", () => {
        expect(pageForShare(0.5, 10, 1)).toBe(5);
        expect(pageForShare(1, 9, 2)).toBe(4);
        expect(pageForShare(0, 9, 2)).toBe(0);
        expect(pageForShare(Number.NaN, 9, 1)).toBe(0);
        for (let view = 0; view < 10; view++) expect(pageForShare(shareOfPage(view, 10, 1), 10, 1)).toBe(view);
        // A chapter of one page is read once it is open.
        expect(shareOfPage(0, 1, 1)).toBe(1);
    });

    it("scrolls a place to the top of the stage (AC-6, the anchor)", () => {
        expect(scrollTopFor(340, 100, 1000)).toBe(1240);
        expect(scrollTopFor(50, 100, 20)).toBe(0);
    });
});

describe("the direction of the book (#753 AC-7, FR-10)", () => {
    it("turns forward to the left in a right-to-left book", () => {
        expect(forwardSign("ltr")).toBe(1);
        expect(forwardSign("rtl")).toBe(-1);
        expect(stripOffset(2, { perView: 1, stridePx: 700 }, "ltr")).toBe(-1400);
        expect(stripOffset(2, { perView: 2, stridePx: 700 }, "rtl")).toBe(2800);
        expect(dragDirection(-40, "ltr")).toBe(1);
        expect(dragDirection(40, "rtl")).toBe(1);
        expect(dragDirection(40, "ltr")).toBe(-1);
        expect(dragDirection(0, "ltr")).toBe(0);
    });

    it("taps the edge the book turns towards in pages, and leaves Scroll as it was", () => {
        expect(edgeTurn("forward", "page", "ltr")).toBe(1);
        expect(edgeTurn("back", "page", "rtl")).toBe(1);
        expect(edgeTurn("forward", "spread", "rtl")).toBe(-1);
        expect(edgeTurn("back", "scroll", "rtl")).toBe(-1);
    });
});

describe("what a key means in each layout (#753 FR-2, FR-4, FR-10)", () => {
    it("turns a page with Space, PageDown and the arrow the book reads towards", () => {
        for (const layout of ["page", "spread"] as const) {
            expect(keyIntent(layout, " ", false)).toBe("page+");
            expect(keyIntent(layout, " ", true)).toBe("page-");
            expect(keyIntent(layout, "PageDown", false)).toBe("page+");
            expect(keyIntent(layout, "PageUp", false)).toBe("page-");
            expect(keyIntent(layout, "ArrowRight", false, "ltr")).toBe("page+");
            expect(keyIntent(layout, "ArrowLeft", false, "ltr")).toBe("page-");
            expect(keyIntent(layout, "ArrowLeft", false, "rtl")).toBe("page+");
            expect(keyIntent(layout, "ArrowRight", false, "rtl")).toBe("page-");
        }
    });

    it("changes nothing in Scroll: the arrows are the chapters, Space a screen", () => {
        expect(keyIntent("scroll", "ArrowRight", false)).toBe("chapter+");
        expect(keyIntent("scroll", "ArrowLeft", false)).toBe("chapter-");
        expect(keyIntent("scroll", "PageDown", false)).toBe("chapter+");
        expect(keyIntent("scroll", "ArrowRight", false, "rtl")).toBe("chapter+");
        expect(keyIntent("scroll", " ", false)).toBe("screen+");
        expect(keyIntent("scroll", " ", true)).toBe("screen-");
        expect(keyIntent("scroll", "x", false)).toBeNull();
    });
});

describe("a page under a finger (#753 FR-13, on the rules of #750)", () => {
    const width = 900;
    it("completes past a third or on a flick, and springs back short of it", () => {
        expect(releaseTurn({ dx: -(width / 3 + 1), vx: 0, width })).toBe("complete");
        expect(releaseTurn({ dx: -10, vx: -0.9, width })).toBe("complete");
        expect(releaseTurn({ dx: -10, vx: 0, width })).toBe("spring");
    });

    it("rubber-bands at a third", () => {
        expect(rubberBand(90)).toBe(30);
    });
});

describe("the type shapes the pages too (#757 FR-2, FR-3, FR-8)", () => {
    it("is 3.6's shape at Medium width and margins", () => {
        expect(pageShape("medium", "medium")).toEqual(DEFAULT_PAGE_SHAPE);
        expect(pageGeometry({ layout: "page", width: 1400, chPx: 9, shape: DEFAULT_PAGE_SHAPE })).toEqual(pageGeometry({ layout: "page", width: 1400, chPx: 9 }));
        expect(pageGeometry({ layout: "spread", width: 1600, chPx: 9, shape: DEFAULT_PAGE_SHAPE })).toEqual(pageGeometry({ layout: "spread", width: 1600, chPx: 9 }));
    });

    it("measures a page in characters: Narrow shorter, Wide longer", () => {
        const page = (width: "narrow" | "medium" | "wide") => pageGeometry({ layout: "page", width: 1600, chPx: 9, shape: pageShape(width, "medium") }).columnPx;
        expect(page("narrow")).toBe(56 * 9);
        expect(page("medium")).toBe(68 * 9);
        expect(page("wide")).toBe(80 * 9);
    });

    it("puts more air between the pages with Large margins, less with Small", () => {
        const gap = (margins: "small" | "medium" | "large") => pageShape("medium", margins).gapScale;
        expect(gap("small")).toBeLessThan(1);
        expect(gap("large")).toBeGreaterThan(1);
        const tight = pageGeometry({ layout: "page", width: 400, chPx: 9, shape: pageShape("medium", "small") });
        const roomy = pageGeometry({ layout: "page", width: 400, chPx: 9, shape: pageShape("medium", "large") });
        expect(roomy.columnPx).toBeLessThan(tight.columnPx);
    });
});
