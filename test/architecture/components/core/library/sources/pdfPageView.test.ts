import { describe, it, expect } from "@jest/globals";
import {
    CANVAS_MAX_PIXELS,
    MAX_DRAWN,
    RUN_GAP,
    RUN_PAD,
    clampZoom,
    drawSize,
    focalScroll,
    mostOnScreen,
    nextRotation,
    normalizePageView,
    pageBox,
    pdfSpreadFits,
    resolveDest,
    rubberZoom,
    runLayout,
    shareDown,
    stepView,
    viewsOf,
    visibleWindow,
    zoomFor,
} from "architecture/components/core/library/sources/pdfPageView";

const LETTER = { width: 612, height: 792 };

describe("Page view's zoom (#767 AC-1)", () => {
    it("fits the width, the whole page, or a level of the width", () => {
        const view = { width: 1000 + 2 * RUN_PAD, height: 700 + 2 * RUN_PAD };
        expect(zoomFor("width", LETTER, view)).toBeCloseTo(1000 / 612);
        // The tighter side: here the height.
        expect(zoomFor("page", LETTER, view)).toBeCloseTo(700 / 792);
        expect(zoomFor(2, LETTER, view)).toBeCloseTo((2 * 1000) / 612);
        // A spread fits two pages across, with the gutter between them.
        expect(zoomFor("width", LETTER, view, 2)).toBeCloseTo((1000 - RUN_GAP) / 2 / 612);
    });

    it("swaps a turned page's sides", () => {
        expect(pageBox(LETTER, 90)).toEqual({ width: 792, height: 612 });
        expect(pageBox(LETTER, 180)).toEqual(LETTER);
        expect(pageBox(LETTER, 270)).toEqual({ width: 792, height: 612 });
        const view = { width: 1032, height: 2000 };
        expect(zoomFor("width", pageBox(LETTER, 90), view)).toBeCloseTo(1000 / 792);
    });

    it("keeps a level between 50 % and 400 %, and resists past them", () => {
        expect(clampZoom(5)).toBe(4);
        expect(clampZoom(0.1)).toBe(0.5);
        expect(clampZoom(1.5)).toBe(1.5);
        expect(rubberZoom(2)).toBe(2);
        // Past the limit it still follows, each step counting for less.
        expect(rubberZoom(8)).toBeGreaterThan(4);
        expect(rubberZoom(8)).toBeLessThan(5);
        expect(rubberZoom(16)).toBeGreaterThan(rubberZoom(8));
        expect(rubberZoom(0.2)).toBeLessThan(0.5);
        expect(rubberZoom(0.2)).toBeGreaterThan(0.35);
    });

    it("keeps the point under the pointer where it is", () => {
        // A word 300 px into the view, the view scrolled 200 px: at twice the scale it is at 1000 px.
        const scroll = focalScroll(200, 300, 1, 2);
        expect(scroll).toBe(700);
        expect((scroll + 300) / 2).toBe((200 + 300) / 1);
        // Never before the start.
        expect(focalScroll(0, 10, 2, 1)).toBe(0);
    });
});

describe("a page is never drawn past what the device can draw (#767 AC-2)", () => {
    it("draws at the device's ratio while it fits", () => {
        expect(drawSize(400, 500, 2)).toEqual({ width: 800, height: 1000 });
    });

    it("caps the drawing, keeps its aspect, and never draws nothing", () => {
        const size = drawSize(2000, 2600, 3, CANVAS_MAX_PIXELS);
        expect(size.width * size.height).toBeLessThanOrEqual(CANVAS_MAX_PIXELS);
        expect(size.width / size.height).toBeCloseTo(2000 / 2600, 2);
        // A 4,000 % request: still a picture, at the cap.
        const huge = drawSize(612 * 40, 792 * 40, 2, CANVAS_MAX_PIXELS);
        expect(huge.width).toBeGreaterThan(0);
        expect(huge.height).toBeGreaterThan(0);
        expect(huge.width * huge.height).toBeLessThanOrEqual(CANVAS_MAX_PIXELS);
        expect(huge.width * huge.height).toBeGreaterThan(CANVAS_MAX_PIXELS * 0.99);
        expect(drawSize(0, 0, 0).width).toBeGreaterThan(0);
    });
});

describe("the run of pages and what is drawn (#767 AC-3)", () => {
    const view = { width: 800, height: 600 };
    const boxes = Array.from({ length: 5 }, () => LETTER);

    it("runs pages down a column, or across a row", () => {
        const down = runLayout(boxes, { layout: "scroll", across: false, scale: 1, view });
        expect(down.slots.map((s) => s.y)).toEqual([16, 16 + 792 + 16, 16 + 2 * (792 + 16), 16 + 3 * 808, 16 + 4 * 808]);
        expect(new Set(down.slots.map((s) => s.x))).toEqual(new Set([Math.round((800 - 612) / 2)]));
        const across = runLayout(boxes, { layout: "scroll", across: true, scale: 1, view });
        expect(across.slots.map((s) => s.x)).toEqual([16, 16 + 628, 16 + 2 * 628, 16 + 3 * 628, 16 + 4 * 628]);
        expect(across.width).toBe(16 + 5 * 612 + 4 * 16 + 16);
    });

    it("shows one page in Page, and in Spread page 1 alone on the right, then pairs", () => {
        const page = runLayout(boxes, { layout: "page", across: false, scale: 0.5, view, current: 2 });
        expect(page.pages).toEqual([2]);
        expect(viewsOf(5, "spread", true)).toEqual([[0], [1, 2], [3, 4]]);
        const first = runLayout(boxes, { layout: "spread", across: false, scale: 0.5, view, current: 0, fits: true });
        expect(first.pages).toEqual([0]);
        // On the right of the gutter.
        expect(first.slots[0].x).toBeGreaterThanOrEqual(first.width / 2);
        const pair = runLayout(boxes, { layout: "spread", across: false, scale: 0.5, view, current: 2, fits: true });
        expect(pair.pages).toEqual([1, 2]);
        expect(pair.slots[0].x + pair.slots[0].w).toBeLessThan(pair.slots[1].x);
        // No room: one page per view.
        expect(viewsOf(5, "spread", false)).toEqual([[0], [1], [2], [3], [4]]);
        expect(runLayout(boxes, { layout: "spread", across: false, scale: 0.5, view, current: 2, fits: false }).pages).toEqual([2]);
    });

    it("asks for a spread only on a reading clearly wider than tall", () => {
        expect(pdfSpreadFits({ width: 1400, height: 900 })).toBe(true);
        expect(pdfSpreadFits({ width: 1180, height: 820 })).toBe(true);
        expect(pdfSpreadFits({ width: 820, height: 1180 })).toBe(false);
        expect(pdfSpreadFits({ width: 0, height: 0 })).toBe(false);
    });

    it("turns a view at a time", () => {
        expect(stepView(0, 1, 5, "spread", true)).toBe(1);
        expect(stepView(1, 1, 5, "spread", true)).toBe(3);
        expect(stepView(2, -1, 5, "spread", true)).toBe(0);
        expect(stepView(0, -1, 5, "spread", true)).toBe(-1);
        expect(stepView(4, 1, 5, "spread", true)).toBe(5);
        expect(stepView(2, 1, 5, "page", true)).toBe(3);
    });

    it("draws what is on screen and next to it, and knows the page most on screen", () => {
        const run = runLayout(boxes, { layout: "scroll", across: false, scale: 1, view });
        // Scrolled to the second page's middle.
        const scroll = { left: 0, top: 808 + 400 };
        expect(visibleWindow(run.slots, scroll, view).map((s) => s.page)).toEqual([1, 2]);
        expect(mostOnScreen(run.slots, scroll, view)).toBe(1);
        expect(mostOnScreen(run.slots, { left: 0, top: 808 * 2 - 100 }, view)).toBe(2);
    });

    it("never draws more than seven, anywhere in a 600-page paper, at any zoom", () => {
        const many = Array.from({ length: 600 }, () => LETTER);
        for (const scale of [0.05, 0.2, 1, 3]) {
            for (const across of [false, true]) {
                const run = runLayout(many, { layout: "scroll", across, scale, view });
                for (let step = 0; step <= 50; step++) {
                    const at = ((across ? run.width : run.height) * step) / 50;
                    const win = visibleWindow(run.slots, across ? { left: at, top: 0 } : { left: 0, top: at }, view, across);
                    expect(win.length).toBeLessThanOrEqual(MAX_DRAWN);
                }
            }
        }
    });
});

describe("a link inside the paper (#767 AC-7)", () => {
    const lookup = {
        getDestination: async (name: string) => (name === "refs" ? [{ num: 7 }, { name: "FitH" }, 500] : null),
        getPageIndex: async (ref: unknown) => (ref as { num: number }).num,
    };

    it("resolves an explicit destination, a named one, and nothing", async () => {
        expect(await resolveDest([{ num: 3 }, { name: "XYZ" }, 0, 700, 0], lookup)).toEqual({ page: 3, top: 700 });
        expect(await resolveDest("refs", lookup)).toEqual({ page: 7, top: 500 });
        expect(await resolveDest([2, { name: "Fit" }], lookup)).toEqual({ page: 2 });
        expect(await resolveDest("nowhere", lookup)).toBeNull();
        expect(await resolveDest(null, lookup)).toBeNull();
        expect(await resolveDest([{ num: 1 }], { ...lookup, getPageIndex: async () => Promise.reject(new Error("bad ref")) })).toBeNull();
    });

    it("says how far down the page the place is", () => {
        expect(shareDown(792, LETTER, 0)).toBe(0);
        expect(shareDown(396, LETTER, 0)).toBe(0.5);
        expect(shareDown(396, LETTER, 90)).toBeUndefined();
        expect(shareDown(undefined, LETTER, 0)).toBeUndefined();
    });
});

describe("what Page view keeps with a paper (#767 AC-4)", () => {
    it("reads a malformed value as the default", () => {
        expect(normalizePageView({ zoom: "x", rotate: { 3: 45 } })).toEqual({});
        expect(normalizePageView(null)).toEqual({});
        expect(normalizePageView([1])).toEqual({});
        expect(normalizePageView({ zoom: 9 })).toEqual({});
    });

    it("keeps a fit or a level, the direction and the turned pages", () => {
        expect(normalizePageView({ zoom: 1.5, across: true, rotate: { 3: 90, x: 90, 4: 180 } })).toEqual({ zoom: 1.5, across: true, rotate: { 3: 90, 4: 180 } });
        expect(normalizePageView({ fit: "page", zoom: 2 })).toEqual({ fit: "page" });
    });

    it("turns a page a quarter at a time", () => {
        expect(nextRotation(undefined)).toBe(90);
        expect(nextRotation(90)).toBe(180);
        expect(nextRotation(270)).toBe(0);
    });
});

describe("a landscape page at Fit width (#767 walk)", () => {
    it("is fitted on its own, never run off the screen; a level of zoom is not capped", () => {
        const boxes = [LETTER, { width: 792, height: 612 }, LETTER];
        const view = { width: 800, height: 600 };
        const fit = runLayout(boxes, { layout: "scroll", across: false, scale: 768 / 612, view, capWidth: 768 });
        expect(fit.slots.map((s) => s.w)).toEqual([768, 768, 768]);
        expect(fit.width).toBe(800);
        const zoomed = runLayout(boxes, { layout: "scroll", across: false, scale: 768 / 612, view });
        expect(zoomed.slots[1].w).toBeGreaterThan(768);
    });
});
