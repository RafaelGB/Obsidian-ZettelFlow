import { describe, it, expect } from "@jest/globals";
import {
    CROP_BORDER,
    WHOLE_PAGE,
    containsBox,
    cropOpsOf,
    frameFor,
    inkOf,
    marksOf,
    measurePage,
    paperFrames,
    rotateFrame,
    sampleIndices,
    shareBox,
    sharedFrameBox,
    type CropBox,
    type PageInk,
} from "application/library/pdfCrop";
import { runLayout, zoomFor, RUN_PAD } from "architecture/components/core/library/sources/pdfPageView";
import { PAGE_H, PAGE_W, PDFJS_OPS, cropPaper, marginOf, printedRects, toView, type CropPage } from "../../support/pdfCropPaper";

/**
 * **Crop margins** (#769), the pure half: what is printed on a page (AC-1), the paper's two frames
 * (AC-2), that no frame cuts anything printed on any page of a sample paper (AC-3), and *Fit width*
 * on the frame — one scale for every page, a turned page with its turned frame (AC-4).
 */

const OPS = cropOpsOf(PDFJS_OPS)!;
const paper = cropPaper();

/** A page of the paper, measured as `pdfSource` measures it. */
function measured(p: CropPage): PageInk {
    const items = p.runs.map((r) => ({ str: r.str, transform: [r.size ?? 10, 0, 0, r.size ?? 10, r.x, r.y], width: r.width ?? 0, height: r.size ?? 10 }));
    return measurePage(items, p.ops, OPS, toView, PAGE_W, PAGE_H);
}

const share = (rect: number[]): CropBox => shareBox(toView(rect), PAGE_W, PAGE_H);
const all = paper.map((p, index) => ({ index, ink: inkOf(measured(p)) }));
const frames = paperFrames(all)!;

describe("what is printed on a page (#769 AC-1)", () => {
    it("reads an image under a transform, inside save and restore, as the unit square through the matrix", () => {
        const marks = marksOf(
            [PDFJS_OPS.save, PDFJS_OPS.transform, PDFJS_OPS.paintImageXObject, PDFJS_OPS.restore, PDFJS_OPS.paintImageXObject],
            [null, [200, 0, 0, 120, 70, 90], ["img", 2, 2], null, ["img2", 2, 2]],
            OPS
        );
        expect(marks).toEqual([
            [70, 90, 270, 210],
            // After the restore the matrix is the page's own again.
            [0, 0, 1, 1],
        ]);
    });

    it("reads a painted path's min/max box through the matrix, and leaves a clip out", () => {
        const fill = new Float32Array([10, 20, 30, 60]);
        const marks = marksOf(
            [PDFJS_OPS.transform, PDFJS_OPS.constructPath, PDFJS_OPS.constructPath],
            [
                [2, 0, 0, 2, 100, 100],
                [PDFJS_OPS.fill, [new Float32Array([0, 10, 20])], fill],
                [PDFJS_OPS.endPath, [new Float32Array([0, 0, 0])], new Float32Array([0, 0, 612, 792])],
            ],
            OPS
        );
        expect(marks).toEqual([[120, 140, 160, 220]]);
    });

    it("turns a form's own matrix on and off with it", () => {
        const marks = marksOf(
            [PDFJS_OPS.paintFormXObjectBegin, PDFJS_OPS.paintImageXObject, PDFJS_OPS.paintFormXObjectEnd, PDFJS_OPS.paintImageXObject],
            [[[10, 0, 0, 10, 5, 5], [0, 0, 1, 1]], ["a", 1, 1], [], ["b", 1, 1]],
            OPS
        );
        expect(marks).toEqual([
            [5, 5, 15, 15],
            [0, 0, 1, 1],
        ]);
    });

    it("does not trust an operator shape it does not know: the page is unknown", () => {
        expect(marksOf([PDFJS_OPS.constructPath], [[[13, 14], [0, 0, 600, 0], [0, 0, 600, 0]]], OPS)).toBe("unknown");
        expect(marksOf([PDFJS_OPS.transform], [[1, 0, 0]], OPS)).toBe("unknown");
        expect(marksOf([PDFJS_OPS.shadingFill], [["sh"]], OPS)).toBe("unknown");
        // And an empty path (pdf.js's starting box) is simply nothing drawn.
        expect(marksOf([PDFJS_OPS.constructPath], [[PDFJS_OPS.fill, [new Float32Array([])], new Float32Array([Infinity, Infinity, -Infinity, -Infinity])]], OPS)).toEqual([]);
    });

    it("is the union of the runs and the marks, plus the border, kept on the page", () => {
        const ink: PageInk = { runs: [{ x: 0.2, y: 0.1, w: 0.5, h: 0.6 }], marks: [{ x: 0.3, y: 0.5, w: 0.6, h: 0.3 }], aspect: 1 };
        const box = inkOf(ink)!;
        expect(box.x).toBeCloseTo(0.2 - CROP_BORDER);
        expect(box.y).toBeCloseTo(0.1 - CROP_BORDER);
        expect(box.x + box.w).toBeCloseTo(0.9 + CROP_BORDER);
        expect(box.y + box.h).toBeCloseTo(0.8 + CROP_BORDER);
        // The border is the same in points on every side: on a tall page it is a smaller share of the height.
        const tall = inkOf({ ...ink, aspect: 2 })!;
        expect(tall.y).toBeCloseTo(0.1 - CROP_BORDER / 2);
        // At the page's edge the border stops at the edge.
        const edge = inkOf({ runs: [{ x: 0, y: 0, w: 1, h: 0.2 }], marks: [], aspect: 1 })!;
        expect(edge.x).toBe(0);
        expect(edge.y).toBe(0);
        expect(edge.x + edge.w).toBeCloseTo(1);
    });

    it("leaves out a mark covering the page (its background), and a page with no text is a picture", () => {
        const runs = [{ x: 0.2, y: 0.2, w: 0.5, h: 0.5 }];
        const withBackground = inkOf({ runs, marks: [{ x: 0, y: 0, w: 1, h: 1 }], aspect: 1 })!;
        expect(withBackground.w).toBeCloseTo(0.5 + 2 * CROP_BORDER);
        expect(inkOf({ runs: [], marks: [{ x: 0.1, y: 0.1, w: 0.3, h: 0.3 }], aspect: 1 })).toBeNull();
        expect(inkOf({ runs, marks: "unknown", aspect: 1 })).toBeNull();
        // The tinted page of the sample paper is framed on its text, not on its tint.
        expect(all[7].ink!.w).toBeLessThan(0.8);
    });
});

describe("the paper's two frames (#769 AC-2)", () => {
    it("measures every page of a short paper, and 24 of a long one, spread out, the first pages of both sides", () => {
        expect(sampleIndices(12, 24)).toEqual(Array.from({ length: 12 }, (_, i) => i));
        const long = sampleIndices(600, 24);
        expect(long).toHaveLength(24);
        expect(new Set(long).size).toBe(24);
        expect(long.slice(0, 5)).toEqual([0, 1, 2, 3, 4]);
        expect(long[long.length - 1]).toBe(599);
        expect(long.filter((i) => i % 2 === 0).length).toBeGreaterThan(4);
        expect(long.filter((i) => i % 2 === 1).length).toBeGreaterThan(4);
    });

    it("gives right-hand and left-hand pages their own frame, after their margins", () => {
        expect(frames.right.x).toBeGreaterThan(frames.left.x);
        expect(frames.right.x).toBeCloseTo(marginOf(2) / PAGE_W - CROP_BORDER, 2);
        expect(frames.left.x).toBeCloseTo(marginOf(1) / PAGE_W - CROP_BORDER, 2);
    });

    it("frames the title page and the short last page on their side's frame — never larger, never smaller", () => {
        expect(frameFor(0, frames, all[0].ink)).toEqual(frames.right);
        expect(frameFor(11, frames, all[11].ink)).toEqual(frames.left);
    });

    it("keeps all of a page whose ink is beyond the frame, and shows an unknown page whole", () => {
        // Frames measured without the plot's page: the plot's page reaches past them, and keeps it all.
        const without = paperFrames(all.filter((s) => s.index !== 4))!;
        const ink = all[4].ink!;
        expect(containsBox(without.right, ink)).toBe(false);
        const own = frameFor(4, without, ink);
        expect(containsBox(own, ink)).toBe(true);
        expect(containsBox(own, without.right)).toBe(true);
        expect(all[9].ink).toBeNull();
        expect(frameFor(9, frames, all[9].ink)).toEqual(WHOLE_PAGE);
        // Not measured yet: its side's frame, until it is.
        expect(frameFor(9, frames, undefined)).toEqual(frames.left);
    });

    it("has nothing to frame when no page could be measured", () => {
        expect(paperFrames([{ index: 0, ink: null }])).toBeNull();
        const one = paperFrames([{ index: 1, ink: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } }])!;
        expect(one.right).toEqual(one.left);
    });
});

describe("no frame cuts anything printed (#769 AC-3, FR-2)", () => {
    it("holds every run and every mark of every page of the sample paper", () => {
        paper.forEach((p, index) => {
            const frame = frameFor(index, frames, all[index].ink);
            for (const rect of printedRects(p)) expect(containsBox(frame, share(rect))).toBe(true);
            const marks = marksOf(p.ops.fnArray, p.ops.argsArray, OPS);
            if (marks === "unknown") {
                expect(frame).toEqual(WHOLE_PAGE);
                return;
            }
            for (const rect of marks) {
                const box = share(rect);
                // The tint is the page itself.
                if (box.w * box.h >= 0.95) continue;
                expect(containsBox(frame, box)).toBe(true);
            }
        });
    });

    it("keeps the running head, the page number, the footnote, the marginal note and both figures", () => {
        const head = share([marginOf(2), 760, marginOf(2) + 60, 768]);
        const number = share([marginOf(2) + 350, 40, marginOf(2) + 360, 48]);
        expect(containsBox(frameFor(2, frames, all[2].ink), head)).toBe(true);
        expect(containsBox(frameFor(2, frames, all[2].ink), number)).toBe(true);
        expect(containsBox(frameFor(5, frames, all[5].ink), share([marginOf(5), 70, marginOf(5) + 150, 77]))).toBe(true);
        expect(containsBox(frameFor(3, frames, all[3].ink), share([marginOf(3) + 380, 600, marginOf(3) + 430, 607]))).toBe(true);
        expect(containsBox(frameFor(4, frames, all[4].ink), share([marginOf(4), 300, marginOf(4) + 400, 450]))).toBe(true);
        expect(containsBox(frameFor(6, frames, all[6].ink), share([marginOf(6), 90, marginOf(6) + 200, 210]))).toBe(true);
    });
});

describe("Fit width on the frame (#769 AC-4, FR-3)", () => {
    const view = { width: 800, height: 600 };
    const page = { width: PAGE_W, height: PAGE_H };

    it("fits the wider of the two frames, one scale for every page", () => {
        const shared = sharedFrameBox(page, frames);
        expect(shared.width).toBeCloseTo(PAGE_W * Math.max(frames.right.w, frames.left.w));
        const scale = zoomFor("width", shared, view);
        expect(scale).toBeCloseTo((view.width - 2 * RUN_PAD) / shared.width);
        // Laid out on their frames at that one scale, every page's text is the same size.
        const boxes = paper.map((_, i) => {
            const f = frameFor(i, frames, all[i].ink);
            return { width: PAGE_W * f.w, height: PAGE_H * f.h };
        });
        const layout = runLayout(boxes, { layout: "scroll", across: false, scale, view });
        expect(layout.slots[2].w).toBe(Math.floor(boxes[2].width * scale));
        expect(layout.slots[1].w).toBe(Math.floor(boxes[1].width * scale));
        // Bigger than the whole sheet at Fit width: that is the point.
        expect(scale).toBeGreaterThan(zoomFor("width", page, view) * 1.2);
    });

    it("turns a frame with its page: a quarter turn swaps its sides and moves it", () => {
        const f = { x: 0.2, y: 0.1, w: 0.5, h: 0.7 };
        expect(rotateFrame(f, 0)).toEqual(f);
        const q = rotateFrame(f, 90);
        expect(q.w).toBeCloseTo(0.7);
        expect(q.h).toBeCloseTo(0.5);
        expect(q.x).toBeCloseTo(0.2);
        expect(q.y).toBeCloseTo(0.2);
        const half = rotateFrame(f, 180);
        expect(half.x).toBeCloseTo(0.3);
        expect(half.y).toBeCloseTo(0.2);
        const three = rotateFrame(f, 270);
        expect(three.x).toBeCloseTo(0.1);
        expect(three.y).toBeCloseTo(0.3);
        // Four quarters are the frame again.
        const back = rotateFrame(rotateFrame(rotateFrame(q, 90), 90), 90);
        expect(back.x).toBeCloseTo(f.x);
        expect(back.y).toBeCloseTo(f.y);
        // A turned page is fitted on its turned frame.
        const turned = sharedFrameBox({ width: PAGE_H, height: PAGE_W }, frames, 90);
        expect(turned.width).toBeCloseTo(PAGE_H * Math.max(frames.right.h, frames.left.h));
    });
});
