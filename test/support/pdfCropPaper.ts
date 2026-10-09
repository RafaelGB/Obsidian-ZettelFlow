/**
 * **A sample paper for Crop margins** (#769): twelve pages of a printed book, with what a crop must
 * never cut. Each page is its text runs (as `fakePdf` reads them) and its operator list **in pdf.js
 * 5.3's shape**, as T1 dumped it from Obsidian 1.14.4's own pdf.js (5.3.34):
 *
 * - `constructPath` → `[paintOp, [Float32Array path data], Float32Array minMax]`, the box in the
 *   path's own space (the current matrix applies); `endPath` as the paint op is a clip, not ink.
 * - an image → `transform [w 0 0 h x y]`, then `paintImageXObject [id, w, h]`, inside `save`/`restore`.
 *
 * Pages: a title page (0), then running heads and page numbers on every page, alternating margins
 * (right-hand pages sit further right), a marginal note (3), a vector plot under a matrix (4), a
 * footnote (5), an image figure (6), a full-page tinted background (7), a page read by an older
 * pdf.js shape the frame must not trust (9), and a short last page (11).
 */
import type { FakePage, FakeRun } from "./fakePdf";

/** The op codes of pdf.js 5.3's `OPS`, as the app has them (the ones Crop margins reads). */
export const PDFJS_OPS = {
    dependency: 1,
    save: 10,
    restore: 11,
    transform: 12,
    stroke: 20,
    fill: 22,
    endPath: 28,
    beginText: 31,
    endText: 32,
    setFont: 37,
    showText: 44,
    shadingFill: 62,
    paintFormXObjectBegin: 74,
    paintFormXObjectEnd: 75,
    beginGroup: 76,
    endGroup: 77,
    paintImageMaskXObject: 83,
    paintImageMaskXObjectGroup: 84,
    paintImageXObject: 85,
    paintInlineImageXObject: 86,
    paintImageXObjectRepeat: 88,
    paintImageMaskXObjectRepeat: 89,
    paintSolidColorImageMask: 90,
    constructPath: 91,
} as const;

export interface FakeOpList {
    fnArray: number[];
    argsArray: unknown[];
}

export interface CropPage extends FakePage {
    ops: FakeOpList;
}

export const PAGE_W = 612;
export const PAGE_H = 792;
const SIZE = 9;
/** A line of the body is this wide, in points: from the inner margin to well short of the outer one. */
const LINE_W = 360;

const line = (str: string, x: number, y: number, size = SIZE, width = LINE_W): FakeRun => ({ str, x, y, size, width, hasEOL: true });

/** Where the text block starts on a page: right-hand pages sit further from the spine's left. */
export const marginOf = (index: number) => (index % 2 === 0 ? 130 : 70);

/** A painted path, in 5.3's shape. */
function path(paint: number, box: [number, number, number, number]): [number, unknown] {
    return [PDFJS_OPS.constructPath, [paint, [new Float32Array([0, box[0], box[1], 1, box[2], box[3]])], new Float32Array(box)]];
}

function ops(entries: [number, unknown][]): FakeOpList {
    return { fnArray: entries.map((e) => e[0]), argsArray: entries.map((e) => e[1]) };
}

function page(index: number): CropPage {
    const x0 = marginOf(index);
    const runs: FakeRun[] = [];
    const entries: [number, unknown][] = [[PDFJS_OPS.dependency, ["g_d0_f1"]]];
    if (index === 0) {
        runs.push(line("On replicas", 220, 600, 22, 150), line("A short book", 250, 570, 12, 80));
        return { runs, width: PAGE_W, height: PAGE_H, ops: ops(entries) };
    }
    // The running head and the page number: the crop must keep both (FR-2).
    runs.push(line(index % 2 === 0 ? "ON REPLICAS" : "CHAPTER ONE", x0, 760, 8, 60));
    runs.push(line(String(index + 1), index % 2 === 0 ? x0 + LINE_W - 10 : x0, 40, 8, 10));
    const lines = index === 11 ? 8 : 50;
    for (let l = 0; l < lines; l++) runs.push(line(`Line ${l + 1} of page ${index + 1}, where the replicas keep in step.`, x0, 730 - l * 12));
    // Every page clips to its media box first: a path that only clips is not ink.
    entries.push([PDFJS_OPS.save, null], path(PDFJS_OPS.endPath, [0, 0, PAGE_W, PAGE_H]), [PDFJS_OPS.restore, null]);
    if (index === 3) runs.push(line("a margin note", x0 + LINE_W + 20, 600, 7, 50));
    if (index === 4) {
        // A vector plot under a matrix: its curve reaches past the text block's right edge.
        entries.push(
            [PDFJS_OPS.save, null],
            [PDFJS_OPS.transform, [1, 0, 0, 1, x0, 300]],
            path(PDFJS_OPS.stroke, [0, 0, 0, 150]),
            path(PDFJS_OPS.stroke, [0, 0, LINE_W, 0]),
            path(PDFJS_OPS.stroke, [0, 0, LINE_W + 40, 145]),
            path(PDFJS_OPS.fill, [50, 0, 80, 60]),
            [PDFJS_OPS.restore, null]
        );
    }
    if (index === 5) runs.push(line("1. A footnote at the foot of the page.", x0, 70, 7, 150));
    if (index === 6) {
        // An image figure below the text, 200 × 120 pt.
        entries.push([PDFJS_OPS.save, null], [PDFJS_OPS.transform, [200, 0, 0, 120, x0, 90]], [PDFJS_OPS.paintImageXObject, ["img_p6_1", 2, 2]], [PDFJS_OPS.restore, null]);
    }
    if (index === 7) {
        // A tinted page: its background covers the whole of it, and is not something printed on it.
        entries.unshift([PDFJS_OPS.save, null], path(PDFJS_OPS.fill, [0, 0, PAGE_W, PAGE_H]), [PDFJS_OPS.restore, null]);
    }
    if (index === 9) {
        // An older pdf.js's constructPath — `[ops[], args[], minMax]` — is not a shape to trust.
        entries.push([PDFJS_OPS.constructPath, [[13, 14], [0, 0, 600, 0], [0, 0, 600, 0]]]);
    }
    return { runs, width: PAGE_W, height: PAGE_H, ops: ops(entries) };
}

/** The paper: twelve pages. */
export function cropPaper(): CropPage[] {
    return Array.from({ length: 12 }, (_, i) => page(i));
}

/** Every box printed on a page, in PDF space — what AC-3 checks no frame cuts. */
export function printedRects(p: CropPage): [number, number, number, number][] {
    return p.runs.map((r) => [r.x, r.y, r.x + (r.width ?? r.str.length * (r.size ?? 10) * 0.5), r.y + (r.size ?? 10)]);
}

/** PDF space to the upright page's viewport at scale 1 (from its top-left), as pdf.js maps it. */
export function toView(rect: ArrayLike<number>): number[] {
    return [rect[0], PAGE_H - rect[1], rect[2], PAGE_H - rect[3]];
}
