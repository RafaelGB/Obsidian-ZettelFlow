/**
 * **Pages that print more than text** (#850): operator lists in pdf.js 5.3's shape (as
 * `pdfCropPaper.ts` documents it) for a logo, a photograph, rules and a ruled table — the pieces a
 * designed document is made of. Coordinates are PDF points on a Letter page, from its bottom-left.
 */
import { PDFJS_OPS, PAGE_H, PAGE_W, type FakeOpList } from "./pdfCropPaper";

export type OpEntry = [number, unknown];

/** A picture `w × h` points with its bottom-left at `x, y`. */
export function image(x: number, y: number, w: number, h: number): OpEntry[] {
    return [
        [PDFJS_OPS.save, null],
        [PDFJS_OPS.transform, [w, 0, 0, h, x, y]],
        [PDFJS_OPS.paintImageXObject, ["img", 10, 10]],
        [PDFJS_OPS.restore, null],
    ];
}

/** A painted path covering `[x1, y1, x2, y2]`. */
export function shape(x1: number, y1: number, x2: number, y2: number): OpEntry {
    return [PDFJS_OPS.constructPath, [PDFJS_OPS.stroke, [new Float32Array([0, x1, y1, 1, x2, y2])], new Float32Array([x1, y1, x2, y2])]];
}

/** A rule across the page at height `y`, from `x1` to `x2`, half a point thick. */
export const across = (y: number, x1 = 72, x2 = 540): OpEntry => shape(x1, y, x2, y + 0.5);
/** A rule down the page at `x`, from `y1` to `y2`. */
export const down = (x: number, y1: number, y2: number): OpEntry => shape(x, y1, x + 0.5, y2);

/** A table ruled as a grid: `rows + 1` lines across, `cols + 1` down, its top at `top`. */
export function grid(top: number, rows: number, cols: number, rowH = 18, x1 = 72, x2 = 540): OpEntry[] {
    const out: OpEntry[] = [];
    for (let r = 0; r <= rows; r++) out.push(across(top - r * rowH, x1, x2));
    for (let c = 0; c <= cols; c++) out.push(down(x1 + ((x2 - x1) * c) / cols, top - rows * rowH, top));
    return out;
}

export function opList(...entries: (OpEntry | OpEntry[])[]): FakeOpList {
    const flat = entries.flatMap((e) => (Array.isArray(e[0]) ? (e as OpEntry[]) : [e as OpEntry]));
    return { fnArray: flat.map((e) => e[0]), argsArray: flat.map((e) => e[1]) };
}

/** PDF space to the upright page, as `convertToViewportRectangle` does at scale 1. */
export const toView = (rect: ArrayLike<number>): number[] => [rect[0], PAGE_H - rect[1], rect[2], PAGE_H - rect[3]];

/** The vendor's logo, top right of every page. */
export const LOGO = image(470, 740, 70, 28);

export { PAGE_W, PAGE_H };
