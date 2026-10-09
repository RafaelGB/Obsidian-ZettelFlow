/**
 * **Draw across a line and it is highlighted** (#746, epic #740) — pure.
 *
 * A pen stroke that runs *along* a line of text — flat, long enough for a couple of words, open and
 * straight — is a highlight stroke; anything else stays ink (FR-1). The words it covers are the ones
 * whose middle lies under it, on the single line nearest the stroke, snapped to whole words (FR-2).
 *
 * Every threshold is in the reading text's own units (line heights and ems), so it holds at every
 * size. They are tunable: the device walk on #746 records the values a real hand needs.
 *
 * The geometry is the caller's: px on the page, or any unit, as long as points, words, line height
 * and em share it. #747's recogniser reuses `strokeMetrics` and owns the classification from then on.
 */

import type { TextSpan } from "application/thinking/quoteAnchor";
import type { WordBox } from "./inkAnchor";

/** A highlight stroke is less tall than this share of a line. */
export const LINE_MAX_HEIGHT_LH = 0.6;
/** …at least this many ems wide: about two words. */
export const LINE_MIN_WIDTH_EM = 2.5;
/** …no steeper than this (its height over its width): a diagonal is not a line. */
export const LINE_MAX_SLOPE = 0.12;
/** …this straight (end to end over the path's length): a scribble or a written word is not. */
export const LINE_MIN_STRAIGHTNESS = 0.85;
/** …and open: an end that comes back near its start (a circle, a loop) is not a line. */
export const LINE_MAX_CLOSURE = 0.3;
/** A stroke takes the line whose middle is nearest, within this many line heights — never two. */
export const LINE_BAND_LH = 0.75;
/** A second stroke this soon after the first, on contiguous words, extends the same highlight (FR-5). */
export const EXTEND_WINDOW_MS = 4000;

export interface StrokePoint {
    x: number;
    y: number;
}

export interface StrokeMetrics {
    box: { left: number; top: number; right: number; bottom: number; width: number; height: number };
    /** The path's length. */
    length: number;
    /** From the first point to the last. */
    chord: number;
    /** 0 for an open stroke, 1 when it ends where it began. */
    closure: number;
    /** Chord over length: 1 for a ruled line, far less for handwriting. */
    straightness: number;
    /** How many times the stroke turned back horizontally by more than the tolerance. */
    reversals: number;
    /** The stroke's mean height, along its length. */
    meanY: number;
    /** The way it was drawn: a mark sweeps from the side the stroke began (FR-11). */
    direction: "ltr" | "rtl";
}

/** What a stroke is, measured once. `tolerance` (the caller's unit) ignores a tremor in `reversals`. */
export function strokeMetrics(points: readonly StrokePoint[], tolerance = 0): StrokeMetrics {
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    let length = 0;
    let weighted = 0;
    let reversals = 0;
    let heading = 0;
    let extreme = points[0]?.x ?? 0;
    for (let i = 0; i < points.length; i++) {
        const { x, y } = points[i];
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (i === 0) continue;
        const prev = points[i - 1];
        const step = Math.hypot(x - prev.x, y - prev.y);
        length += step;
        weighted += step * ((y + prev.y) / 2);
        // A turn back counts once the stroke has gone `tolerance` the other way from its furthest point.
        if (heading === 0) {
            if (Math.abs(x - extreme) > tolerance) {
                heading = x > extreme ? 1 : -1;
                extreme = x;
            }
        } else if ((x - extreme) * heading > 0) extreme = x;
        else if (Math.abs(x - extreme) > tolerance) {
            reversals++;
            heading = -heading;
            extreme = x;
        }
    }
    if (points.length === 0) left = top = right = bottom = 0;
    const first = points[0] ?? { x: 0, y: 0 };
    const last = points[points.length - 1] ?? first;
    const chord = Math.hypot(last.x - first.x, last.y - first.y);
    const width = right - left;
    const height = bottom - top;
    const span = Math.max(width, height);
    return {
        box: { left, top, right, bottom, width, height },
        length,
        chord,
        closure: span > 0 ? Math.max(0, Math.min(1, 1 - chord / span)) : 1,
        straightness: length > 0 ? chord / length : 0,
        reversals,
        meanY: length > 0 ? weighted / length : first.y,
        direction: last.x < first.x ? "rtl" : "ltr",
    };
}

/** The reading type a stroke is judged by: its line and its em, in the stroke's own unit. */
export interface LineContext {
    linePx: number;
    emPx: number;
}

/** Whether a stroke runs along a line of text (FR-1). Over text or not is the caller's (`bandWords`). */
export function isLineStroke(metrics: StrokeMetrics, ctx: LineContext): boolean {
    const { width, height } = metrics.box;
    if (!(width > 0) || !(ctx.linePx > 0) || !(ctx.emPx > 0)) return false;
    return (
        height < LINE_MAX_HEIGHT_LH * ctx.linePx &&
        width >= LINE_MIN_WIDTH_EM * ctx.emPx &&
        height / width <= LINE_MAX_SLOPE &&
        metrics.straightness >= LINE_MIN_STRAIGHTNESS &&
        metrics.closure <= LINE_MAX_CLOSURE
    );
}

/** The words a stroke covers: their span of the text, the words themselves, and the line's middle. */
export interface Band<W extends WordBox = WordBox> {
    span: TextSpan;
    words: W[];
    middle: number;
}

/** The words as lines, top to bottom: a word belongs to a line whose middle is within half a line. */
export function linesOf<W extends WordBox>(words: readonly W[], linePx: number): { middle: number; words: W[] }[] {
    const lines: { middle: number; words: W[] }[] = [];
    const sorted = [...words].sort((a, b) => a.top + a.height / 2 - (b.top + b.height / 2) || a.left - b.left);
    for (const word of sorted) {
        const mid = word.top + word.height / 2;
        const line = lines[lines.length - 1];
        if (line && Math.abs(line.middle - mid) <= linePx / 2) {
            line.words.push(word);
            line.middle = line.words.reduce((sum, w) => sum + w.top + w.height / 2, 0) / line.words.length;
        } else lines.push({ middle: mid, words: [word] });
    }
    return lines;
}

/**
 * The whole words under a stroke (FR-2): the single line whose middle is nearest the stroke's mean
 * height (within `LINE_BAND_LH`), and on it every word whose middle lies inside the stroke's reach,
 * from the first to the last. `null` over the margin, between paragraphs, or under nothing.
 */
export function bandWords<W extends WordBox>(points: readonly StrokePoint[], words: readonly W[], linePx: number): Band<W> | null {
    if (points.length === 0 || words.length === 0) return null;
    const metrics = strokeMetrics(points);
    let best: { middle: number; words: W[] } | null = null;
    let nearest = Infinity;
    for (const line of linesOf(words, linePx)) {
        const distance = Math.abs(line.middle - metrics.meanY);
        if (distance < nearest) {
            nearest = distance;
            best = line;
        }
    }
    if (!best || nearest > LINE_BAND_LH * linePx) return null;
    const { left, right } = metrics.box;
    const covered = best.words.filter((word) => {
        const mid = word.left + word.width / 2;
        return mid >= left && mid <= right;
    });
    if (covered.length === 0) return null;
    covered.sort((a, b) => a.start - b.start);
    return { span: { start: covered[0].start, end: Math.max(...covered.map((w) => w.end)) }, words: covered, middle: best.middle };
}

/**
 * Whether a highlight stroke continues the last one (FR-5): drawn within `EXTEND_WINDOW_MS`, and on
 * words contiguous with it — nothing but whitespace between them in the text, either way round, or
 * overlapping. A sentence that wraps is one highlight.
 */
export function extendsHighlight(last: { span: TextSpan; at: number } | null, span: TextSpan, text: string, now: number): boolean {
    if (!last || now - last.at > EXTEND_WINDOW_MS) return false;
    if (span.start <= last.span.end && span.end >= last.span.start) return true;
    const gap = span.start >= last.span.end ? text.slice(last.span.end, span.start) : text.slice(span.end, last.span.start);
    return /^\s*$/.test(gap);
}
