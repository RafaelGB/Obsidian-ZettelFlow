/**
 * **Crop margins** (#769, epic #739) — pure: what is printed on a page, and the frame a paper is read
 * through. No DOM, no pdf.js: the operator list and the text runs come in as plain arrays.
 *
 * A printed page is mostly margin. With *Crop margins* on, Page view frames each page on what is
 * printed on it, so *Fit width* fits the text rather than the paper (FR-1). Three rules hold it:
 *
 * - **Nothing printed is ever cut** (FR-2). What is printed is the union of the page's text runs,
 *   its pictures **and its drawn shapes** (a plot is vector paths, not an image). An operator this
 *   file does not recognise makes the page *unknown*, and an unknown page is not cropped at all.
 * - **The same size from page to page** (FR-3). A paper gets two frames, one for its right-hand
 *   pages and one for its left-hand ones, each the union of that side's sampled pages. A page with
 *   less on it (a title page, a short last page) uses its side's frame; a page with more keeps it
 *   all (the frame grows for that page alone — never cut wins over the same size).
 * - **A page with no text is a picture** (FR-4): a scan, a plate. It is shown whole.
 *
 * Every box here is in **shares of the page as drawn upright** (0–1, from its top-left), so a
 * frame does not care about the page's size, and turns with the page (`rotateFrame`).
 */

/** A box on a page, as shares (0–1) of its width and height, from its top-left. */
export interface CropBox {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** A rectangle in PDF space: `[x1, y1, x2, y2]`, from the bottom-left. */
export type PdfRect = [number, number, number, number];

/** What one page has printed on it, as boxes on the page (`PageInk` is what `SourcePages.ink` reads). */
export interface PageInk {
    /** The text runs' boxes. */
    runs: CropBox[];
    /** The pictures' and the drawn shapes' boxes — or `"unknown"` when the page could not be read. */
    marks: CropBox[] | "unknown";
    /** The page's height over its width (the border is the same on every side). */
    aspect: number;
}

/** A paper's two frames: p. 1 is a right-hand page, as a printed book opens. */
export interface PaperFrames {
    right: CropBox;
    left: CropBox;
}

/** The whole page: what an unknown page, or a picture page, is framed on. */
export const WHOLE_PAGE: CropBox = Object.freeze({ x: 0, y: 0, w: 1, h: 1 });

/** The border around what is printed, as a share of the page's width — about 18 pt on a Letter page. */
export const CROP_BORDER = 0.03;

/** A mark covering this much of the page is its background (a tinted page), not something printed on it. */
export const BACKGROUND_SHARE = 0.95;

/** How many pages are measured to find a paper's frames. */
export const CROP_SAMPLE = 24;

/** The operators the frame reads, by their pdf.js names; the codes come from the loaded library. */
export interface CropOps {
    save: number;
    restore: number;
    transform: number;
    constructPath: number;
    endPath?: number;
    paintImageXObject: number;
    paintInlineImageXObject?: number;
    paintImageMaskXObject?: number;
    paintSolidColorImageMask?: number;
    paintFormXObjectBegin?: number;
    paintFormXObjectEnd?: number;
    /** Operators that paint an extent this file cannot tell (a shading over the clip, a repeated image). */
    shadingFill?: number;
    paintImageXObjectRepeat?: number;
    paintImageMaskXObjectRepeat?: number;
    paintImageMaskXObjectGroup?: number;
}

/** The op codes a pdf.js `OPS` table gives, or `null` when it does not have the ones that matter. */
export function cropOpsOf(raw: unknown): CropOps | null {
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    const need = ["save", "restore", "transform", "constructPath", "paintImageXObject"] as const;
    if (!need.every((name) => typeof o[name] === "number")) return null;
    const out: Record<string, number> = {};
    for (const [name, value] of Object.entries(o)) if (typeof value === "number") out[name] = value;
    return out as unknown as CropOps;
}

// Bound once: the measuring loops run tens of thousands of times, and a global looked up on every
// call costs more than the arithmetic (jest's sandbox, and any page with a deep global chain).
const { min, max, hypot, round, abs, floor } = Math;
const isFiniteNumber = Number.isFinite;
const INF = Number.POSITIVE_INFINITY;

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

const finite = (n: unknown): n is number => typeof n === "number" && isFiniteNumber(n);

function isMatrix(raw: unknown): raw is ArrayLike<number> {
    if (!raw || typeof raw !== "object" || (raw as ArrayLike<number>).length !== 6) return false;
    for (let i = 0; i < 6; i++) if (!finite((raw as ArrayLike<number>)[i])) return false;
    return true;
}

/** `m` applied after `n`: a point goes through `n` first (PDF's `cm` concatenates this way). */
function compose(m: Matrix, n: ArrayLike<number>): Matrix {
    return [
        m[0] * n[0] + m[2] * n[1],
        m[1] * n[0] + m[3] * n[1],
        m[0] * n[2] + m[2] * n[3],
        m[1] * n[2] + m[3] * n[3],
        m[0] * n[4] + m[2] * n[5] + m[4],
        m[1] * n[4] + m[3] * n[5] + m[5],
    ];
}

/** The box `[x1, y1, x2, y2]` covering a rectangle once it goes through `m`. */
function boxThrough(m: Matrix, x1: number, y1: number, x2: number, y2: number): PdfRect {
    // The corners through the matrix, without an array per corner: this runs for every mark.
    const ax = m[0] * x1, bx = m[0] * x2, cx = m[2] * y1, dx = m[2] * y2;
    const ay = m[1] * x1, by = m[1] * x2, cy = m[3] * y1, dy = m[3] * y2;
    return [min(ax, bx) + min(cx, dx) + m[4], min(ay, by) + min(cy, dy) + m[5], max(ax, bx) + max(cx, dx) + m[4], max(ay, by) + max(cy, dy) + m[5]];
}

/**
 * **What is drawn on a page**, read from its operator list (pdf.js 5.3's shape, checked in the app):
 * a small interpreter of the graphics state — `save` / `restore` / `transform`, a form's own matrix —
 * that keeps the box of every **picture** (the unit square through the current matrix) and every
 * **painted path** (`constructPath`'s `[paint, [data], minMax]`, its min/max box through the matrix).
 * A path that only clips is not ink. Anything whose shape it does not recognise — a `constructPath`
 * of another pdf.js, a shading over the clip, a repeated image — makes the page `"unknown"`, and an
 * unknown page is never cropped (FR-2 by construction).
 */
export function marksOf(fnArray: ArrayLike<number>, argsArray: ArrayLike<unknown>, ops: CropOps): PdfRect[] | "unknown" {
    const out: PdfRect[] = [];
    const stack: Matrix[] = [];
    let ctm: Matrix = IDENTITY;
    const unknownOps = new Set([ops.shadingFill, ops.paintImageXObjectRepeat, ops.paintImageMaskXObjectRepeat, ops.paintImageMaskXObjectGroup].filter(finite));
    const images = new Set([ops.paintImageXObject, ops.paintInlineImageXObject, ops.paintImageMaskXObject, ops.paintSolidColorImageMask].filter(finite));
    for (let i = 0; i < fnArray.length; i++) {
        const fn = fnArray[i];
        const args = argsArray[i];
        if (fn === ops.save) stack.push(ctm);
        else if (fn === ops.restore) ctm = stack.pop() ?? IDENTITY;
        else if (fn === ops.transform) {
            if (!isMatrix(args)) return "unknown";
            ctm = compose(ctm, args);
        } else if (fn === ops.paintFormXObjectBegin) {
            stack.push(ctm);
            const matrix = Array.isArray(args) ? (args[0] as unknown) : null;
            if (matrix !== null && matrix !== undefined) {
                if (!isMatrix(matrix)) return "unknown";
                ctm = compose(ctm, matrix);
            }
        } else if (fn === ops.paintFormXObjectEnd) ctm = stack.pop() ?? IDENTITY;
        else if (fn === ops.constructPath) {
            // pdf.js 5.3: [paint op, [path data], minMax] — the box is the third.
            if (!Array.isArray(args) || args.length < 3 || !finite(args[0])) return "unknown";
            const box = args[2] as ArrayLike<number> | null;
            if (!box || typeof box !== "object" || box.length !== 4) return "unknown";
            if (args[0] === ops.endPath) continue; // a clip, or nothing: not printed
            const [x1, y1, x2, y2] = [box[0], box[1], box[2], box[3]];
            // An empty path keeps pdf.js's starting box (INF, -INF): nothing drawn.
            if (![x1, y1, x2, y2].every(finite)) continue;
            out.push(boxThrough(ctm, x1, y1, x2, y2));
        } else if (images.has(fn)) out.push(boxThrough(ctm, 0, 0, 1, 1));
        else if (unknownOps.has(fn)) return "unknown";
    }
    return out;
}

/** A text run's box in PDF space: along its direction by its width, up by its height, a descent below. */
export function runRect(item: { transform: ArrayLike<number>; width: number; height: number }): PdfRect | null {
    const m = item.transform;
    if (!m || m.length < 6 || ![m[0], m[1], m[2], m[3], m[4], m[5]].every(finite)) return null;
    const width = finite(item.width) ? max(0, item.width) : 0;
    const height = finite(item.height) && item.height > 0 ? item.height : hypot(m[2], m[3]);
    if (!(width > 0) && !(height > 0)) return null;
    const along = hypot(m[0], m[1]) || 1;
    const up = hypot(m[2], m[3]) || 1;
    // Along the run by its width; from a descent below the baseline to its height above.
    const wx = (m[0] / along) * width;
    const wy = (m[1] / along) * width;
    const ux = (m[2] / up) * height;
    const uy = (m[3] / up) * height;
    const x1 = min(0, wx) + min(-0.3 * ux, ux);
    const x2 = max(0, wx) + max(-0.3 * ux, ux);
    const y1 = min(0, wy) + min(-0.3 * uy, uy);
    const y2 = max(0, wy) + max(-0.3 * uy, uy);
    return [m[4] + x1, m[5] + y1, m[4] + x2, m[5] + y2];
}

/** A rectangle on the page as drawn (CSS-like, from the top-left, in `width × height`), as shares of it. */
export function shareBox(rect: ArrayLike<number>, width: number, height: number): CropBox {
    const w = max(1e-6, width);
    const h = max(1e-6, height);
    const x1 = min(rect[0], rect[2]);
    const x2 = max(rect[0], rect[2]);
    const y1 = min(rect[1], rect[3]);
    const y2 = max(rect[1], rect[3]);
    return { x: x1 / w, y: y1 / h, w: (x2 - x1) / w, h: (y2 - y1) / h };
}

/**
 * **A page, measured**: its text runs (the words only) and its operator list, put on the page as
 * drawn — `toView` turns a PDF rectangle into the viewport's (pdf.js's `convertToViewportRectangle`
 * at scale 1, with the page's own turn), `width × height` is that viewport.
 */
export function measurePage(
    items: readonly { str?: string; transform?: ArrayLike<number>; width?: number; height?: number }[],
    opList: { fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> } | null,
    ops: CropOps | null,
    toView: (rect: PdfRect) => ArrayLike<number>,
    width: number,
    height: number
): PageInk {
    const runs: CropBox[] = [];
    for (const item of items) {
        if (typeof item.str !== "string" || !item.str.trim() || !item.transform) continue;
        const rect = runRect({ transform: item.transform, width: item.width ?? 0, height: item.height ?? 0 });
        if (rect) runs.push(shareBox(toView(rect), width, height));
    }
    const raw = opList && ops ? marksOf(opList.fnArray, opList.argsArray, ops) : "unknown";
    const marks = raw === "unknown" ? "unknown" : raw.map((rect) => shareBox(toView(rect), width, height));
    return { runs, marks, aspect: height / max(1e-6, width) };
}

/** A box kept on the page: whatever lies off it is not on the paper. */
function clampBox(b: CropBox): CropBox | null {
    const x1 = max(0, b.x);
    const y1 = max(0, b.y);
    const x2 = min(1, b.x + b.w);
    const y2 = min(1, b.y + b.h);
    return x2 > x1 && y2 > y1 ? { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } : null;
}

/** The smallest box holding both. */
export function unionBox(a: CropBox, b: CropBox): CropBox {
    const x1 = min(a.x, b.x);
    const y1 = min(a.y, b.y);
    const x2 = max(a.x + a.w, b.x + b.w);
    const y2 = max(a.y + a.h, b.y + b.h);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** Whether `inner` lies inside `outer` (to a hair). */
export function containsBox(outer: CropBox, inner: CropBox, eps = 1e-6): boolean {
    return inner.x >= outer.x - eps && inner.y >= outer.y - eps && inner.x + inner.w <= outer.x + outer.w + eps && inner.y + inner.h <= outer.y + outer.h + eps;
}

/**
 * **What is printed on a page** (AC-1): the union of its text runs and its marks — a mark covering
 * nearly all of it is its background, and left out — plus an even border, kept on the page.
 * `null` when the page is not to be cropped: it has no text (a picture, FR-4), or it could not be
 * read (`"unknown"`, FR-2).
 */
export function inkOf(ink: PageInk, border = CROP_BORDER): CropBox | null {
    if (ink.marks === "unknown") return null;
    // One pass, four numbers: a dense page has a thousand runs and thousands of marks.
    let x1 = INF;
    let y1 = INF;
    let x2 = -INF;
    let y2 = -INF;
    let runs = 0;
    const take = (b: CropBox, isMark: boolean) => {
        const l = max(0, b.x);
        const t = max(0, b.y);
        const r = min(1, b.x + b.w);
        const d = min(1, b.y + b.h);
        if (!(r > l && d > t)) return;
        if (isMark && (r - l) * (d - t) >= BACKGROUND_SHARE) return;
        if (!isMark) runs++;
        if (l < x1) x1 = l;
        if (t < y1) y1 = t;
        if (r > x2) x2 = r;
        if (d > y2) y2 = d;
    };
    for (const run of ink.runs) take(run, false);
    if (runs === 0) return null;
    for (const mark of ink.marks) take(mark, true);
    const bx = border;
    const by = border / max(0.1, ink.aspect || 1);
    return clampBox({ x: x1 - bx, y: y1 - by, w: x2 - x1 + 2 * bx, h: y2 - y1 + 2 * by });
}

/**
 * **The pages measured** to find a paper's frames: every page of a short paper; of a long one,
 * `max` pages spread across it, always the first five — the title page and two of each side after it.
 */
export function sampleIndices(count: number, most = CROP_SAMPLE): number[] {
    const n = max(0, floor(count));
    if (n <= most) return Array.from({ length: n }, (_, i) => i);
    const picked = new Set<number>([0, 1, 2, 3, 4]);
    const rest = most - picked.size;
    for (let k = 0; k < rest; k++) picked.add(round(5 + (k * (n - 1 - 5)) / max(1, rest - 1)));
    for (let i = n - 1; picked.size < most && i >= 0; i--) picked.add(i);
    return [...picked].sort((a, b) => a - b);
}

/** Whether a page is a right-hand one: p. 1 (index 0) opens on the right, as a printed book does. */
export function isRightHand(index: number): boolean {
    return index % 2 === 0;
}

/**
 * **A paper's two frames** (AC-2, FR-3): the union of each side's measured pages. A side with no
 * page that could be measured borrows the other's; `null` when no page at all could be.
 */
export function paperFrames(samples: readonly { index: number; ink: CropBox | null }[]): PaperFrames | null {
    let right: CropBox | null = null;
    let left: CropBox | null = null;
    for (const sample of samples) {
        if (!sample.ink) continue;
        if (isRightHand(sample.index)) right = right ? unionBox(right, sample.ink) : sample.ink;
        else left = left ? unionBox(left, sample.ink) : sample.ink;
    }
    if (!right && !left) return null;
    return { right: right ?? left!, left: left ?? right! };
}

/**
 * **One page's frame** (AC-2): its side's frame, grown to hold the page's own ink when it has more
 * (never cut); the whole page for a picture or an unknown page (`ink` = `null`); its side's frame
 * while the page is not measured yet (`ink` = `undefined`).
 */
export function frameFor(index: number, frames: PaperFrames, ink?: CropBox | null): CropBox {
    if (ink === null) return WHOLE_PAGE;
    const side = isRightHand(index) ? frames.right : frames.left;
    return ink === undefined ? side : unionBox(side, ink);
}

/** A frame on a page turned `rotation` more, clockwise (AC-4): it turns with the page. */
export function rotateFrame(frame: CropBox, rotation: number): CropBox {
    const r = (((round(rotation / 90) * 90) % 360) + 360) % 360;
    const { x, y, w, h } = frame;
    if (r === 90) return { x: 1 - y - h, y: x, w: h, h: w };
    if (r === 180) return { x: 1 - x - w, y: 1 - y - h, w, h };
    if (r === 270) return { x: y, y: 1 - x - w, w: h, h: w };
    return { x, y, w, h };
}

/** A page's box (points, as drawn) cut to its frame. */
export function croppedBox(box: { width: number; height: number }, frame: CropBox): { width: number; height: number } {
    return { width: box.width * frame.w, height: box.height * frame.h };
}

/**
 * The box the paper is fitted on with crop on (AC-4, FR-3): the wider of its two frames, and the
 * taller — one scale for every page, so the text keeps its size as you turn.
 */
export function sharedFrameBox(box: { width: number; height: number }, frames: PaperFrames, rotation = 0): { width: number; height: number } {
    const right = rotateFrame(frames.right, rotation);
    const left = rotateFrame(frames.left, rotation);
    return { width: box.width * max(right.w, left.w), height: box.height * max(right.h, left.h) };
}

/** A share down (or across) the page, as a share of the frame shown of it — and back. */
export function shareInFrame(share: number, start: number, length: number): number {
    return (share - start) / max(1e-6, length);
}

export function shareOfPage(share: number, start: number, length: number): number {
    return start + share * length;
}

/** A box on the page, as shares of the frame shown of it (a link on a cropped page, FR-5). */
export function boxInFrame(box: CropBox, frame: CropBox): CropBox {
    return { x: (box.x - frame.x) / max(1e-6, frame.w), y: (box.y - frame.y) / max(1e-6, frame.h), w: box.w / max(1e-6, frame.w), h: box.h / max(1e-6, frame.h) };
}

/** Two frames the same, to a hair: a page whose own ink fits its side's frame needs no relayout. */
export function sameBox(a: CropBox, b: CropBox, eps = 1e-4): boolean {
    return abs(a.x - b.x) < eps && abs(a.y - b.y) < eps && abs(a.w - b.w) < eps && abs(a.h - b.h) < eps;
}

/** A stored box, read: four finite shares, on the page, with room. Anything else is `null`. */
export function normalizeCropBox(raw: unknown): CropBox | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const { x, y, w, h } = raw as Record<string, unknown>;
    if (![x, y, w, h].every(finite)) return null;
    const b = { x: x as number, y: y as number, w: w as number, h: h as number };
    const eps = 1e-6;
    if (b.x < -eps || b.y < -eps || b.w <= 0 || b.h <= 0 || b.x + b.w > 1 + eps || b.y + b.h > 1 + eps) return null;
    const keep = (n: number) => round(n * 10000) / 10000;
    return { x: keep(max(0, b.x)), y: keep(max(0, b.y)), w: keep(min(1, b.w)), h: keep(min(1, b.h)) };
}
