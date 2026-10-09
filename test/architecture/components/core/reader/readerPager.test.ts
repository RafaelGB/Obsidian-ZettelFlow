/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { DomNode } from "../../../../support/dashboardDom";
import { recordAnimations, reducedMotion, type AnimationRecord } from "../../../../support/motionDom";
import { ReaderPager } from "architecture/components/core/reader/readerPager";
import { MOTION } from "architecture/components/core/reader/readerMotion";
import { lastSample } from "architecture/monitoring/measure";

/**
 * A stage and a chapter laid out as ten columns. No browser here: the stage's box, the strip's
 * width and where a place is are what the test says, worked out from the custom properties the
 * pager wrote — the way the stylesheet would lay them out.
 */
function chapter(width = 1000, pages = 10) {
    const stage = new DomNode("div") as any;
    const page = stage.createEl("article", { cls: "zettelkasten-flow__reader-page" }) as any;
    const body = page.createDiv({ cls: "zettelkasten-flow__reader-body" });
    const blocks = Array.from({ length: 6 }, (_, i) => body.createEl("p", { text: `Block ${i}` }));
    const size = { width, height: 800 };
    stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: size.width, height: size.height });
    const prop = (name: string) => parseFloat(page.cssProps[name] ?? "0") || 0;
    const stride = () => prop("--zf-page-col") + prop("--zf-page-gap");
    Object.defineProperty(page, "scrollWidth", { get: () => prop("--zf-page-col") + stride() * (pages - 1) });
    page.getBoundingClientRect = () => ({ left: prop("--zf-page-gap") + prop("--zf-page-x"), top: 0, width: prop("--zf-page-w"), height: 800 });
    /** A place in column `n` of the strip, as it is now. */
    const placeIn = (n: number) => {
        const el = new DomNode("span") as any;
        el.getBoundingClientRect = () => ({ left: page.getBoundingClientRect().left + n * stride() + 3, top: 40, width: 50, height: 20 });
        return el;
    };
    return { stage, page, body, blocks, size, prop, stride, placeIn };
}

describe("the chapter in pages (#753)", () => {
    let rec: AnimationRecord;
    let motion: () => void;
    beforeEach(() => {
        rec = recordAnimations();
        motion = reducedMotion(false);
    });
    afterEach(() => {
        rec.stop();
        motion();
    });

    function paged(width = 1000, layout: "page" | "spread" = "page") {
        const c = chapter(width);
        const pager = new ReaderPager(c.stage, c.page);
        pager.configure(layout, "ltr");
        pager.relayout("start");
        return { ...c, pager };
    }

    it("lays the strip out from custom properties, never an inline style, and times it", () => {
        const { page, pager } = paged();
        for (const name of ["--zf-page-w", "--zf-page-col", "--zf-page-gap", "--zf-page-h", "--zf-page-x"]) expect(page.cssProps[name]).toBeDefined();
        expect(page.cssProps["--zf-page-x"]).toBe("0px");
        expect(pager.views).toBe(10);
        expect(lastSample("reader.paginate")).toBeDefined();
    });

    it("slides one page in the reading direction, on translate alone, in 280 ms (FR-12, AC-8)", () => {
        const { page, pager, stride } = paged();
        expect(pager.turn(1)).toBe(true);
        expect(rec.animations).toHaveLength(1);
        expect([...rec.keys()]).toEqual(["translate"]);
        expect(rec.animations[0].options).toMatchObject({ duration: MOTION.page, easing: MOTION.ease });
        expect(parseFloat(page.cssProps["--zf-page-x"])).toBeCloseTo(-stride(), 1);
        expect(pager.current).toBe(1);
    });

    it("never queues: a second turn ends the first and goes on from where it lands (FR-15)", () => {
        const { pager } = paged();
        pager.turn(1);
        pager.turn(1);
        expect(rec.animations).toHaveLength(2);
        expect(rec.animations[0].playState).toBe("finished");
        expect(pager.current).toBe(2);
    });

    it("turns at once under reduced motion, to the same page (FR-16)", () => {
        motion();
        motion = reducedMotion(true);
        const { pager, page, stride } = paged();
        pager.turn(1);
        pager.turn(1);
        expect(rec.animations).toHaveLength(0);
        expect(pager.current).toBe(2);
        expect(parseFloat(page.cssProps["--zf-page-x"])).toBeCloseTo(-2 * stride(), 1);
    });

    it("says false at the chapter's ends, for the view to turn the chapter", () => {
        const { pager } = paged();
        expect(pager.turn(-1)).toBe(false);
        pager.goTo(9);
        expect(pager.atEnd()).toBe(true);
        expect(pager.turn(1)).toBe(false);
    });

    it("moves by two pages in a spread that fits, and by one where it does not (FR-3)", () => {
        const wide = paged(1600, "spread");
        expect(wide.pager.perView).toBe(2);
        expect(wide.pager.views).toBe(5);
        wide.pager.turn(1);
        expect(parseFloat(wide.page.cssProps["--zf-page-x"])).toBeCloseTo(-2 * wide.stride(), 1);
        const narrow = paged(800, "spread");
        expect(narrow.pager.perView).toBe(1);
    });

    it("lands on the page that holds a place after a change of size, and never empties the page (FR-6, FR-17)", () => {
        const { pager, page, placeIn, size } = paged();
        const empty = jest.spyOn(page, "empty");
        const anchor = placeIn(6);
        size.width = 760;
        pager.relayout({ anchor });
        expect(pager.current).toBe(6);
        pager.relayout({ anchor: placeIn(3) });
        expect(pager.current).toBe(3);
        expect(empty).not.toHaveBeenCalled();
    });

    it("fills the hairline page by page (FR-7)", () => {
        const { pager } = paged();
        expect(pager.fraction()).toBe(0);
        pager.goTo(3);
        expect(pager.fraction()).toBeCloseTo(3 / 9, 5);
        pager.goToShare(1);
        expect(pager.current).toBe(9);
    });

    it("lands a share, the last page, or reveals a place", () => {
        const { pager, placeIn } = paged();
        pager.relayout({ share: 0.5 });
        expect(pager.current).toBe(5);
        pager.relayout("end");
        expect(pager.current).toBe(9);
        pager.reveal(placeIn(2));
        expect(pager.current).toBe(2);
    });

    it("does nothing at all in Scroll", () => {
        const c = chapter();
        const pager = new ReaderPager(c.stage, c.page);
        pager.configure("scroll", "ltr");
        pager.relayout("start");
        expect(pager.paged).toBe(false);
        expect(pager.turn(1)).toBe(false);
        expect(c.page.cssProps["--zf-page-col"]).toBeUndefined();
    });
});

describe("with a finger, the page is in your hand (#753 FR-13, FR-16)", () => {
    let rec: AnimationRecord;
    let motion: () => void;
    beforeEach(() => {
        rec = recordAnimations();
        motion = reducedMotion(false);
    });
    afterEach(() => {
        rec.stop();
        motion();
    });

    function paged() {
        const c = chapter();
        const pager = new ReaderPager(c.stage, c.page);
        pager.configure("page", "ltr");
        pager.relayout("start");
        pager.goTo(4);
        return { ...c, pager, base: parseFloat(c.page.cssProps["--zf-page-x"]) };
    }

    it("follows the finger 1:1 with no animation", () => {
        const { pager, page, base } = paged();
        pager.drag(-120);
        expect(parseFloat(page.cssProps["--zf-page-x"])).toBeCloseTo(base - 120, 1);
        expect(rec.animations).toHaveLength(0);
    });

    it("turns past a third, on translate, and springs back short of it in the shared beat", () => {
        const { pager, page, base, stride } = paged();
        pager.drag(-400);
        expect(pager.release(0)).toBe("complete");
        expect(pager.current).toBe(5);
        expect(parseFloat(page.cssProps["--zf-page-x"])).toBeCloseTo(base - stride(), 1);
        expect([...rec.keys()]).toEqual(["translate"]);
        rec.animations.splice(0);
        pager.drag(-60);
        expect(pager.release(0)).toBe("spring");
        expect(pager.current).toBe(5);
        expect(rec.animations[0].options.duration).toBe(MOTION.base);
        expect([...rec.keys()]).toEqual(["translate"]);
    });

    it("rubber-bands where there is no page that way", () => {
        const { pager, page } = paged();
        pager.goTo(0);
        pager.drag(90);
        expect(parseFloat(page.cssProps["--zf-page-x"])).toBeCloseTo(30, 1);
        expect(pager.release(0)).toBe("spring");
        expect(pager.current).toBe(0);
    });

    it("still follows the finger under reduced motion, and lands at once", () => {
        motion();
        motion = reducedMotion(true);
        const { pager, page, base } = paged();
        pager.drag(-50);
        expect(parseFloat(page.cssProps["--zf-page-x"])).toBeCloseTo(base - 50, 1);
        pager.drag(-500);
        pager.release(0);
        expect(rec.animations).toHaveLength(0);
        expect(pager.current).toBe(5);
    });

    it("always springs back from a gesture the system took", () => {
        const { pager } = paged();
        pager.drag(-500);
        expect(pager.release(0, "spring")).toBe("spring");
        expect(pager.current).toBe(4);
    });
});
