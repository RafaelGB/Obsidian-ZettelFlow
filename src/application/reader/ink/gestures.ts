/**
 * **The lasso** (#747, epic #740; #790) — pure.
 *
 * The pen only draws (#790 FR-2): nothing it writes is read as a gesture. What a loop drawn with the
 * lasso holds is plain geometry — its points and the boxes of the words, ink and marks under it — so
 * it works the same with a Pencil, a pen tablet and a mouse, with no native API.
 */

import type { TextSpan } from "application/thinking/quoteAnchor";
import type { Box, WordBox } from "./inkAnchor";
import { strokeMetrics, type StrokePoint } from "./strokeHighlight";

/** A mark the eraser can act on: a highlight, by its thought. */
export interface MarkRef {
    kind: "highlight";
    id: string;
}

/** A mark on the page, as boxes in the stroke's own unit: a highlight that wraps has several. */
export interface MarkBox {
    ref: MarkRef;
    rects: Box[];
}

interface Rect {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

function overlaps(box: Box, near: Rect): boolean {
    return box.left <= near.right && box.left + box.width >= near.left && box.top <= near.bottom && box.top + box.height >= near.top;
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
