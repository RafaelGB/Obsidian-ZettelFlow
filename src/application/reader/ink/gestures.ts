/**
 * **Circle, arrow, scribble and lasso** (#747, epic #740) — pure.
 *
 * One recogniser for every pen stroke, at pen-up (FR-1): a *line* (#746), a *circle*, an *arrow*, a
 * *scribble*, or *ink*. It is plain geometry — the stroke's points and the boxes of the words and the
 * marks under it — so it works the same with a Pencil, a pen tablet and a mouse, with no native API.
 *
 * **The order of the checks is the bias** (FR-2): line, then circle, then arrow, and the scribble
 * **last**, only when every one of its conditions holds. Anything unclear is ink: when in doubt, keep
 * what was written. Misreading handwriting as an erase is worse than missing an erase.
 *
 * Every threshold is in the reading text's own units (ems and line heights) so it holds at every
 * size, and is named, so the tests can name it and the device walk can tune it (FR-10). The cost is
 * one pass over the points and only the words and marks inside the stroke's box grown by a line
 * (AC-9).
 */

import type { TextSpan } from "application/thinking/quoteAnchor";
import type { Box, WordBox } from "./inkAnchor";
import { GROUP_IDLE_MS } from "./inkGroup";
import { isLineStroke, strokeMetrics, type StrokePoint } from "./strokeHighlight";

// ── the circle (FR-3) ────────────────────────────────────────────────────────────────────────────

/** A circle ends near where it began: the gap, over the larger side of its box. */
export const CIRCLE_MAX_GAP = 0.25;
/** …is at least this big (its larger side, in ems): a written "o" is not a circle. */
export const CIRCLE_MIN_SIZE_EM = 1.2;
/** …and turns once round: at least this much in one direction, in total. */
export const CIRCLE_MIN_TURN = 1.5 * Math.PI;
/** …and not round and round: a spiral, or a loop scrubbed over a mark, is not a circle. */
export const CIRCLE_MAX_TURN = 3 * Math.PI;
/** …and round, not back and forth: it turns back across the page no more than this many times. */
export const CIRCLE_MAX_REVERSALS = 3;

// ── the arrow (FR-4) ─────────────────────────────────────────────────────────────────────────────

/** An arrow's shaft is this straight (end to end over its length). */
export const ARROW_MIN_STRAIGHTNESS = 0.8;
/** …and at least this long, in ems: a written "v" is not an arrow. */
export const ARROW_MIN_SHAFT_EM = 2;
/** Its head reaches no further from the tip than this share of the shaft. */
export const ARROW_HEAD_MAX = 0.35;
/** …and at least this far, in ems: a tremor at the end of a line is not a head. */
export const ARROW_HEAD_MIN_EM = 0.3;
/** Each barb leaves the tip at this angle, in degrees, back from the shaft. */
export const ARROW_HEAD_ANGLE: readonly [number, number] = [20, 70];
/** The tip is where the stroke first turns back by at least this much, in degrees. */
export const ARROW_TIP_TURN = 100;
/** An end lands on a mark within this many ems of it. */
export const ARROW_REACH_EM = 0.8;

// ── the scribble (FR-2, FR-5) — every one of these must hold ─────────────────────────────────────

/** A scribble is a scratch-out: back and forth along the line, turning back at least this many times… */
export const SCRIBBLE_MIN_REVERSALS = 6;
/** …dense: its path at least this many times its box's diagonal… */
export const SCRIBBLE_MIN_DENSITY = 4;
/** …regular: its swings vary by no more than this (their spread over their mean) — handwriting's do… */
export const SCRIBBLE_MAX_AMPLITUDE_CV = 0.35;
/** …no taller than this many lines… */
export const SCRIBBLE_MAX_HEIGHT_LH = 2.5;
/** …with swings at least this wide, in ems… */
export const SCRIBBLE_MIN_SWING_EM = 0.6;
/** …over the same ground: no wider than this many swings, where handwriting moves on as it turns… */
export const SCRIBBLE_MAX_WIDTH_SWINGS = 1.6;
/** …drifting down by no more than this share of a swing per swing… */
export const SCRIBBLE_MAX_PITCH = 0.25;
/** …and back and forth, never round: its turns cancel out, where a circle drawn three times adds up. */
export const SCRIBBLE_MAX_NET_TURN = 3 * Math.PI;
/** A turn back counts once the pen has gone this far the other way, in ems: a tremor is not one. */
export const SCRIBBLE_TOLERANCE_EM = 0.25;

/** A mark a gesture can act on: a highlight or an ink note, by its thought. */
export interface MarkRef {
    kind: "highlight" | "ink";
    id: string;
}

/** A mark on the page, as boxes in the stroke's own unit: a highlight that wraps has several. */
export interface MarkBox {
    ref: MarkRef;
    rects: Box[];
}

/** What a stroke is judged against: the words and marks near it, and the reading type, all in one unit. */
export interface GestureContext {
    words: readonly WordBox[];
    marks: readonly MarkBox[];
    linePx: number;
    emPx: number;
}

export type Gesture =
    | { kind: "line" }
    | { kind: "circle"; span: TextSpan; words: WordBox[]; centre: StrokePoint }
    | { kind: "arrow"; from: MarkRef; to: MarkRef; tail: StrokePoint; tip: StrokePoint }
    | { kind: "arrow-unanchored" }
    | { kind: "scribble"; hits: MarkRef[] }
    | { kind: "ink" };

/** One stroke, or two when the second is a short head; `gapMs` is the time between them. */
export interface GestureInput {
    strokes: readonly (readonly StrokePoint[])[];
    gapMs?: number;
}

/**
 * What a pen stroke is (FR-1). One stroke is judged line → circle → arrow → scribble; two strokes are
 * judged only as an arrow and its head. Anything else, and anything unclear, is ink.
 */
export function recognise(input: GestureInput, ctx: GestureContext): Gesture {
    const { strokes } = input;
    if (!(ctx.emPx > 0) || !(ctx.linePx > 0)) return { kind: "ink" };
    if (strokes.length === 2) {
        if ((input.gapMs ?? 0) > GROUP_IDLE_MS) return { kind: "ink" };
        const arrow = twoStrokeArrow(strokes[0], strokes[1], ctx.emPx);
        return arrow ? anchor(arrow, ctx) : { kind: "ink" };
    }
    if (strokes.length !== 1) return { kind: "ink" };
    const points = strokes[0];
    if (points.length < 3) return { kind: "ink" };
    const metrics = strokeMetrics(points);
    if (isLineStroke(metrics, ctx)) return { kind: "line" };
    const near = nearBox(metrics.box, ctx.linePx);
    const circle = asCircle(points, metrics, ctx, near);
    if (circle) return circle;
    const arrow = oneStrokeArrow(points, ctx.emPx);
    if (arrow) return anchor(arrow, ctx);
    // Last, and only above its own bar (FR-2): an erase is never a guess.
    if (isScribble(points, metrics, ctx)) return { kind: "scribble", hits: marksTouched(points, ctx.marks, near) };
    return { kind: "ink" };
}

// ── geometry ─────────────────────────────────────────────────────────────────────────────────────

type Metrics = ReturnType<typeof strokeMetrics>;
interface Rect {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

function nearBox(box: Metrics["box"], grow: number): Rect {
    return { left: box.left - grow, top: box.top - grow, right: box.right + grow, bottom: box.bottom + grow };
}

function overlaps(box: Box, near: Rect): boolean {
    return box.left <= near.right && box.left + box.width >= near.left && box.top <= near.bottom && box.top + box.height >= near.top;
}

const dist = (a: StrokePoint, b: StrokePoint) => Math.hypot(a.x - b.x, a.y - b.y);

/** The points again, `step` apart along the path: angles measured on them are not a tremor's. */
export function resample(points: readonly StrokePoint[], step: number): StrokePoint[] {
    if (points.length === 0 || !(step > 0)) return [...points];
    const out: StrokePoint[] = [{ x: points[0].x, y: points[0].y }];
    let carry = 0;
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        const seg = dist(a, b);
        if (seg === 0) continue;
        let at = step - carry;
        while (at <= seg) {
            const k = at / seg;
            out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
            at += step;
        }
        carry = seg - (at - step);
    }
    const last = points[points.length - 1];
    const tail = out[out.length - 1];
    if (tail.x !== last.x || tail.y !== last.y) out.push({ x: last.x, y: last.y });
    return out;
}

/** The signed turning of a path, in radians: ±2π once round, about 0 back and forth. */
export function turning(points: readonly StrokePoint[]): number {
    let total = 0;
    for (let i = 2; i < points.length; i++) {
        const ax = points[i - 1].x - points[i - 2].x;
        const ay = points[i - 1].y - points[i - 2].y;
        const bx = points[i].x - points[i - 1].x;
        const by = points[i].y - points[i - 1].y;
        total += Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
    }
    return total;
}

/** Whether a point is inside a closed path (even–odd). */
export function insidePolygon(x: number, y: number, polygon: readonly StrokePoint[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i];
        const b = polygon[j];
        if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
}

/** A path's length. */
function pathLength(points: readonly StrokePoint[], from = 0, to = points.length - 1): number {
    let length = 0;
    for (let i = from + 1; i <= to; i++) length += dist(points[i - 1], points[i]);
    return length;
}

/** The angle at `at` between two directions out of it, in degrees. */
function angleAt(at: StrokePoint, a: StrokePoint, b: StrokePoint): number {
    const ax = a.x - at.x;
    const ay = a.y - at.y;
    const bx = b.x - at.x;
    const by = b.y - at.y;
    const la = Math.hypot(ax, ay);
    const lb = Math.hypot(bx, by);
    if (la === 0 || lb === 0) return 180;
    return (Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)))) * 180) / Math.PI;
}

// ── the circle ───────────────────────────────────────────────────────────────────────────────────

/**
 * A closed loop round words (FR-3): it ends near where it began (or crosses its start), turns once
 * round, is bigger than a letter, and holds at least one word's middle. Round nothing, it is ink.
 */
function asCircle(points: readonly StrokePoint[], metrics: Metrics, ctx: GestureContext, near: Rect): Gesture | null {
    const { width, height } = metrics.box;
    const size = Math.max(width, height);
    if (size < CIRCLE_MIN_SIZE_EM * ctx.emPx || Math.min(width, height) < 0.4 * ctx.emPx) return null;
    // The gap: from each end to the nearest point of the other end's first quarter — so a circle that
    // overshoots its start is as closed as one that stops on it.
    const total = metrics.length;
    let gap = metrics.chord;
    let walked = 0;
    const first = points[0];
    const last = points[points.length - 1];
    for (let i = 1; i < points.length; i++) {
        walked += dist(points[i - 1], points[i]);
        if (walked <= total * 0.25) gap = Math.min(gap, dist(points[i], last));
        if (walked >= total * 0.75) gap = Math.min(gap, dist(points[i], first));
    }
    if (gap / size > CIRCLE_MAX_GAP) return null;
    const turn = Math.abs(turning(resample(points, Math.max(total / 96, ctx.emPx / 20))));
    if (turn < CIRCLE_MIN_TURN || turn > CIRCLE_MAX_TURN) return null;
    if (swings(points, "x", SCRIBBLE_TOLERANCE_EM * ctx.emPx).reversals > CIRCLE_MAX_REVERSALS) return null;
    const inside = ctx.words.filter((word) => {
        if (!overlaps(word, near)) return false;
        return insidePolygon(word.left + word.width / 2, word.top + word.height / 2, points);
    });
    if (inside.length === 0) return null;
    inside.sort((a, b) => a.start - b.start);
    return {
        kind: "circle",
        span: { start: inside[0].start, end: Math.max(...inside.map((w) => w.end)) },
        words: inside,
        centre: { x: (metrics.box.left + metrics.box.right) / 2, y: (metrics.box.top + metrics.box.bottom) / 2 },
    };
}

// ── the arrow ────────────────────────────────────────────────────────────────────────────────────

interface ArrowShape {
    tail: StrokePoint;
    tip: StrokePoint;
}

const inAngle = (angle: number) => angle >= ARROW_HEAD_ANGLE[0] && angle <= ARROW_HEAD_ANGLE[1];

/**
 * One stroke: a straight shaft, then a sharp turn back at the tip into a short head whose barb leaves
 * at 20°–70° from the shaft — and, for a two-barbed head, back to the tip and out again.
 */
function oneStrokeArrow(points: readonly StrokePoint[], em: number): ArrowShape | null {
    const total = pathLength(points);
    if (total < ARROW_MIN_SHAFT_EM * em) return null;
    const pts = resample(points, Math.max(total / 64, em / 10));
    const n = pts.length;
    if (n < 8) return null;
    // The tip: the first sharp turn back in the second half of the path — at its sharpest. The first,
    // because a two-barbed head turns back again at its barb.
    let tipAt = -1;
    let sharpest = 0;
    const w = 2;
    const turnAt = (k: number) => 180 - angleAt(pts[k], pts[Math.max(0, k - w)], pts[Math.min(n - 1, k + w)]);
    for (let k = Math.floor(n * 0.5); k < n - 1; k++) {
        if (turnAt(k) < ARROW_TIP_TURN) continue;
        for (let j = k; j < Math.min(n - 1, k + 2 * w + 1); j++) {
            const turn = turnAt(j);
            if (turn > sharpest) {
                sharpest = turn;
                tipAt = j;
            }
        }
        break;
    }
    if (tipAt < 0) return null;
    const tail = pts[0];
    const tip = pts[tipAt];
    const chord = dist(tail, tip);
    if (chord < ARROW_MIN_SHAFT_EM * em || chord / pathLength(pts, 0, tipAt) < ARROW_MIN_STRAIGHTNESS) return null;
    const head = pts.slice(tipAt);
    let barb = head[0];
    for (const pt of head) if (dist(pt, tip) > dist(barb, tip)) barb = pt;
    const reach = dist(barb, tip);
    if (reach < ARROW_HEAD_MIN_EM * em || reach > ARROW_HEAD_MAX * chord) return null;
    if (pathLength(head) > 3.5 * reach) return null;
    if (!inAngle(angleAt(tip, barb, tail))) return null;
    return { tail, tip };
}

/** Two strokes: a straight shaft, then a short head drawn at one of its ends (FR-4). */
function twoStrokeArrow(shaft: readonly StrokePoint[], head: readonly StrokePoint[], em: number): ArrowShape | null {
    if (shaft.length < 2 || head.length < 2) return null;
    const m = strokeMetrics(shaft);
    if (m.chord < ARROW_MIN_SHAFT_EM * em || m.straightness < ARROW_MIN_STRAIGHTNESS || m.closure > 0.3) return null;
    const ends = [shaft[0], shaft[shaft.length - 1]];
    const reach = Math.max(ARROW_REACH_EM * em, 0.15 * m.chord);
    // The tip is the end the head is drawn at; its vertex is the head's point nearest to it.
    let best: { tip: StrokePoint; tail: StrokePoint; vertex: StrokePoint; d: number } | null = null;
    for (const [i, end] of ends.entries()) {
        let vertex = head[0];
        for (const pt of head) if (dist(pt, end) < dist(vertex, end)) vertex = pt;
        const d = dist(vertex, end);
        if (d <= reach && (!best || d < best.d)) best = { tip: end, tail: ends[1 - i], vertex, d };
    }
    if (!best) return null;
    const { tip, tail, vertex } = best;
    let far = 0;
    for (const pt of head) far = Math.max(far, dist(pt, tip));
    if (far < ARROW_HEAD_MIN_EM * em || far > ARROW_HEAD_MAX * m.chord) return null;
    if (pathLength(head) > 3.5 * far) return null;
    // Its arms: the head's two ends, those that leave the vertex; each at the head's angle.
    const arms = [head[0], head[head.length - 1]].filter((arm) => dist(arm, vertex) >= 0.4 * far);
    if (arms.length === 0) return null;
    for (const arm of arms) if (!inAngle(angleAt(vertex, arm, tail))) return null;
    return { tail, tip };
}

/** Both ends on marks, two different ones, or the arrow only shows what it would need (FR-4). */
function anchor(arrow: ArrowShape, ctx: GestureContext): Gesture {
    const reach = ARROW_REACH_EM * ctx.emPx;
    const from = markAt(arrow.tail, ctx.marks, reach);
    const to = markAt(arrow.tip, ctx.marks, reach);
    if (!from || !to || (from.kind === to.kind && from.id === to.id)) return { kind: "arrow-unanchored" };
    return { kind: "arrow", from, to, tail: arrow.tail, tip: arrow.tip };
}

/** The mark under a point, within `reach` of any of its boxes: the nearest one. */
export function markAt(point: StrokePoint, marks: readonly MarkBox[], reach: number): MarkRef | null {
    let best: MarkRef | null = null;
    let nearest = Infinity;
    for (const mark of marks) {
        for (const rect of mark.rects) {
            const dx = Math.max(0, rect.left - point.x, point.x - (rect.left + rect.width));
            const dy = Math.max(0, rect.top - point.y, point.y - (rect.top + rect.height));
            const d = Math.hypot(dx, dy);
            if (d <= reach && d < nearest) {
                nearest = d;
                best = mark.ref;
            }
        }
    }
    return best;
}

// ── the scribble ─────────────────────────────────────────────────────────────────────────────────

/** How a path swings along one axis: the turns back past `tolerance`, and the swing between each. */
function swings(points: readonly StrokePoint[], axis: "x" | "y", tolerance: number): { reversals: number; swings: number[] } {
    let heading = 0;
    let extreme = points[0][axis];
    let lastTurn: number | null = null;
    let reversals = 0;
    const out: number[] = [];
    for (let i = 1; i < points.length; i++) {
        const v = points[i][axis];
        if (heading === 0) {
            if (Math.abs(v - extreme) > tolerance) {
                heading = v > extreme ? 1 : -1;
                extreme = v;
            } else if (Math.abs(v - points[0][axis]) > Math.abs(extreme - points[0][axis])) extreme = v;
            continue;
        }
        if ((v - extreme) * heading > 0) extreme = v;
        else if (Math.abs(v - extreme) > tolerance) {
            reversals++;
            if (lastTurn !== null) out.push(Math.abs(extreme - lastTurn));
            lastTurn = extreme;
            heading = -heading;
            extreme = v;
        }
    }
    return { reversals, swings: out };
}

/**
 * A scratch-out (FR-2): many turns back along the line, regular, wide, over the same ground, never
 * round, and no taller than a few lines. Handwriting moves on as it turns, and its loops add up.
 */
function isScribble(points: readonly StrokePoint[], metrics: Metrics, ctx: GestureContext): boolean {
    const { width, height } = metrics.box;
    if (height > SCRIBBLE_MAX_HEIGHT_LH * ctx.linePx) return false;
    const diagonal = Math.hypot(width, height);
    if (!(diagonal > 0) || metrics.length / diagonal < SCRIBBLE_MIN_DENSITY) return false;
    const x = swings(points, "x", SCRIBBLE_TOLERANCE_EM * ctx.emPx);
    if (x.reversals < SCRIBBLE_MIN_REVERSALS || x.swings.length < 2) return false;
    const mean = x.swings.reduce((sum, s) => sum + s, 0) / x.swings.length;
    if (mean < SCRIBBLE_MIN_SWING_EM * ctx.emPx) return false;
    const spread = Math.sqrt(x.swings.reduce((sum, s) => sum + (s - mean) ** 2, 0) / x.swings.length);
    if (spread / mean > SCRIBBLE_MAX_AMPLITUDE_CV) return false;
    if (width > SCRIBBLE_MAX_WIDTH_SWINGS * mean) return false;
    if (height / (x.reversals + 1) / mean > SCRIBBLE_MAX_PITCH) return false;
    const net = Math.abs(turning(resample(points, Math.max(metrics.length / 128, ctx.emPx / 10))));
    return net <= SCRIBBLE_MAX_NET_TURN;
}

/** The marks a stroke's path passes over: any point inside one of their boxes. */
function marksTouched(points: readonly StrokePoint[], marks: readonly MarkBox[], near: Rect): MarkRef[] {
    const hits: MarkRef[] = [];
    for (const mark of marks) {
        const rects = mark.rects.filter((rect) => overlaps(rect, near));
        if (rects.length === 0) continue;
        const hit = points.some((pt) => rects.some((r) => pt.x >= r.left && pt.x <= r.left + r.width && pt.y >= r.top && pt.y <= r.top + r.height));
        if (hit) hits.push(mark.ref);
    }
    return hits;
}

// ── the lasso (FR-7) ─────────────────────────────────────────────────────────────────────────────

/** What a lasso holds: the words whose middle is inside the loop, in text order, and their span. */
export function lassoWords<W extends WordBox>(points: readonly StrokePoint[], words: readonly W[]): { span: TextSpan; words: W[] } | null {
    if (points.length < 3) return null;
    const box = strokeMetrics(points).box;
    const near: Rect = { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
    const inside = words.filter((w) => overlaps(w, near) && insidePolygon(w.left + w.width / 2, w.top + w.height / 2, points));
    if (inside.length === 0) return null;
    inside.sort((a, b) => a.start - b.start);
    return { span: { start: inside[0].start, end: Math.max(...inside.map((w) => w.end)) }, words: inside };
}

/** Whether a lasso holds a box: its middle is inside the loop. */
export function lassoHolds(points: readonly StrokePoint[], box: Box): boolean {
    return points.length >= 3 && insidePolygon(box.left + box.width / 2, box.top + box.height / 2, points);
}
