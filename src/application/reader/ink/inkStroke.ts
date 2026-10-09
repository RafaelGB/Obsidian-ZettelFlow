/**
 * **The stroke** (#745 E1, epic #740) — pure.
 *
 * A pen on the page is a run of points: where the nib was, how hard it pressed, how far it leaned and
 * when. This module turns them into what is drawn, and it does so **incrementally**: each new point
 * fixes the segment behind the nib for good and leaves one provisional piece that ends exactly on the
 * nib (FR-18). The kept path is the same function folded over the whole stroke (`segmentsOf`), so the
 * path you see while writing *is* the path that is kept (FR-19, AC-11): pen-up moves nothing.
 *
 * Smoothing is the midpoint quadratic: a curve from the middle of one step to the middle of the next,
 * bent by the point between them. It touches only the last point, so a point costs the same at the end
 * of a long sentence as at its first letter (AC-10).
 *
 * Units are the caller's: px while live, em of the reading text once kept. Widths are always em.
 */

/** One sample of the nib. `p` is the pressure 0–1, `tilt` the altitude in radians (π/2 upright). */
export interface InkPoint {
    x: number;
    y: number;
    p: number;
    tilt: number;
    /** Milliseconds since the stroke began. */
    t: number;
}

/** The width at medium pressure, in ems of the reading text: a fine pencil. */
export const INK_WIDTH_EM = 0.11;
/** How much pressure moves the width either side of medium. */
export const PRESSURE_GAIN = 1.2;
/** How much a pen laid on its side widens the nib… */
export const TILT_GAIN = 0.8;
/** …never past this many times the upright width. */
export const TILT_CAP = 1.6;
/** The thinnest a stroke gets, however light the touch: a share of the medium width. */
export const MIN_WIDTH_SHARE = 0.35;
/**
 * Widths are quantised to this step (a fifth of a pixel at 16 px), so neighbouring segments of
 * the same width merge into one path at pen-up without changing a pixel (#745 Risk 3).
 */
export const WIDTH_STEP_EM = INK_WIDTH_EM / 8;

const UPRIGHT = Math.PI / 2;

/**
 * The nib's width for one sample, in ems (FR-4, AC-7). A mouse — or a pen that reports no pressure
 * while pressed — writes a steady medium line.
 */
export function inkWidth(sample: { pressure?: number; altitude?: number; pointerType?: string }): number {
    const measured = typeof sample.pressure === "number" && sample.pressure > 0 && sample.pointerType !== "mouse";
    const pressure = measured ? Math.min(1, sample.pressure as number) : 0.5;
    const pressed = Math.max(MIN_WIDTH_SHARE, 1 + PRESSURE_GAIN * (pressure - 0.5));
    const altitude = typeof sample.altitude === "number" && Number.isFinite(sample.altitude) ? Math.max(0, Math.min(UPRIGHT, sample.altitude)) : UPRIGHT;
    const tilt = Math.min(TILT_CAP, 1 + TILT_GAIN * (1 - altitude / UPRIGHT));
    return quantise(INK_WIDTH_EM * pressed * tilt);
}

function quantise(width: number): number {
    return Math.round((Math.round(width / WIDTH_STEP_EM) * WIDTH_STEP_EM) * 10000) / 10000;
}

/** A piece of the drawn path: a line, or a quadratic bent by `c`. Its own width, round caps. */
export interface Segment {
    from: [number, number];
    to: [number, number];
    c?: [number, number];
    /** In ems. */
    w: number;
}

/** A stroke being written: its points and the pointer that writes it. */
export interface LiveStroke {
    points: InkPoint[];
    pointerType: string;
}

export function newStroke(pointerType = "pen"): LiveStroke {
    return { points: [], pointerType };
}

function mid(a: InkPoint, b: InkPoint): [number, number] {
    return [(a.x + b.x) / 2, (a.y + b.y) / 2];
}

function widthAt(point: InkPoint, pointerType: string): number {
    return inkWidth({ pressure: point.p, altitude: point.tilt, pointerType });
}

/**
 * Add the nib's newest sample. Returns the segment that just became final behind the nib (none for
 * the very first point) and the provisional one that ends on the nib.
 */
export function appendPoint(stroke: LiveStroke, point: InkPoint): { committed?: Segment; provisional: Segment } {
    const pts = stroke.points;
    pts.push(point);
    const n = pts.length - 1;
    const type = stroke.pointerType;
    if (n === 0) return { provisional: { from: [point.x, point.y], to: [point.x, point.y], w: widthAt(point, type) } };
    return { committed: committedAt(pts, n, type), provisional: provisionalAt(pts, n, type) };
}

/** The segment fixed when point `n` arrives. */
function committedAt(pts: readonly InkPoint[], n: number, type: string): Segment {
    if (n === 1) return { from: [pts[0].x, pts[0].y], to: mid(pts[0], pts[1]), w: widthAt(pts[0], type) };
    const control = pts[n - 1];
    return { from: mid(pts[n - 2], control), c: [control.x, control.y], to: mid(control, pts[n]), w: widthAt(control, type) };
}

/** The straight piece from the last midpoint to the nib. */
function provisionalAt(pts: readonly InkPoint[], n: number, type: string): Segment {
    const last = pts[n];
    return { from: mid(pts[n - 1], last), to: [last.x, last.y], w: widthAt(last, type) };
}

/** A whole stroke's segments: `appendPoint` folded over it, so the kept path is the live one. */
export function segmentsOf(points: readonly InkPoint[], pointerType = "pen"): Segment[] {
    if (points.length === 0) return [];
    if (points.length === 1) return [{ from: [points[0].x, points[0].y], to: [points[0].x, points[0].y], w: widthAt(points[0], pointerType) }];
    const out: Segment[] = [];
    for (let n = 1; n < points.length; n++) out.push(committedAt(points, n, pointerType));
    out.push(provisionalAt(points, points.length - 1, pointerType));
    return out;
}

const round = (n: number, places: number) => {
    const k = 10 ** places;
    return String(Math.round(n * k) / k);
};

/** A segment as path data: `M x y L x y`, or `M x y Q cx cy x y`. */
export function segmentPath(seg: Segment, places = 3): string {
    const [fx, fy] = seg.from;
    const [tx, ty] = seg.to;
    const head = `M${round(fx, places)} ${round(fy, places)}`;
    if (seg.c) return `${head} Q${round(seg.c[0], places)} ${round(seg.c[1], places)} ${round(tx, places)} ${round(ty, places)}`;
    return `${head} L${round(tx, places)} ${round(ty, places)}`;
}

/**
 * Runs of touching segments of the same width as one path each: what pen-up leaves in the page and
 * what a kept drawing holds. Geometry-preserving — the same curves, joined round.
 */
export function mergedPaths(segments: readonly Segment[], places = 3): { d: string; w: number }[] {
    const runs: { parts: string[]; w: number; end: [number, number] }[] = [];
    for (const seg of segments) {
        const run = runs[runs.length - 1];
        if (!run || run.w !== seg.w || run.end[0] !== seg.from[0] || run.end[1] !== seg.from[1]) {
            runs.push({ parts: [segmentPath(seg, places)], w: seg.w, end: seg.to });
            continue;
        }
        const [tx, ty] = seg.to;
        run.parts.push(seg.c ? `Q${round(seg.c[0], places)} ${round(seg.c[1], places)} ${round(tx, places)} ${round(ty, places)}` : `L${round(tx, places)} ${round(ty, places)}`);
        run.end = seg.to;
    }
    return runs.map((run) => ({ d: run.parts.join(" "), w: run.w }));
}

/** The box a set of points covers, widened by the widest nib so nothing is clipped. */
export function pointsBox(points: readonly InkPoint[], pad = 0): { left: number; top: number; right: number; bottom: number } {
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const pt of points) {
        if (pt.x < left) left = pt.x;
        if (pt.y < top) top = pt.y;
        if (pt.x > right) right = pt.x;
        if (pt.y > bottom) bottom = pt.y;
    }
    if (!Number.isFinite(left)) return { left: 0, top: 0, right: 0, bottom: 0 };
    return { left: left - pad, top: top - pad, right: right + pad, bottom: bottom + pad };
}

/** How far a point is from a segment's chord and control — the eraser's whole-stroke hit test. */
export function distanceToSegment(seg: Segment, x: number, y: number): number {
    if (!seg.c) return distanceToLine(seg.from, seg.to, x, y);
    // A quadratic, sampled: a margin word is a few dozen of these, the eraser asks once per move.
    let best = Infinity;
    let prev = seg.from;
    for (let i = 1; i <= 6; i++) {
        const k = i / 6;
        const a = (1 - k) * (1 - k);
        const b = 2 * (1 - k) * k;
        const cc = k * k;
        const point: [number, number] = [a * seg.from[0] + b * seg.c[0] + cc * seg.to[0], a * seg.from[1] + b * seg.c[1] + cc * seg.to[1]];
        best = Math.min(best, distanceToLine(prev, point, x, y));
        prev = point;
    }
    return best;
}

function distanceToLine(a: [number, number], b: [number, number], x: number, y: number): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = dx * dx + dy * dy;
    const k = len === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / len));
    return Math.hypot(x - (a[0] + k * dx), y - (a[1] + k * dy));
}
