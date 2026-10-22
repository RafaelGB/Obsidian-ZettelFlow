/**
 * **Your pen on the shared copy** (#843, epic #836) — pure.
 *
 * Ink drawn in Page view is kept as fractions of the page as it was shown — its place `px, py`, its
 * strokes in ems at 40 to the page's width (`PAGE_EMS`) — at the page's turn now. So a stroke lands on
 * the copy where Page view shows it: each point goes from the turned page back to the page's own user
 * space (`page.view`), and the copy gets one `/Ink` per drawing and colour, its curves the same curves
 * the drawing is made of. Ink drawn beside the reflowed text has no place on a printed page: it is
 * counted, never placed.
 */

import { PAGE_EMS, type PageInkAnchor } from "application/reader/ink/inkAnchor";
import { INK_FILE_COLOUR, type InkStrokeData } from "application/reader/ink/inkSvg";
import { segmentsOf } from "application/reader/ink/inkStroke";
import type { PageInk } from "application/reader/ink/pageInk";
import { isInk, isPageInk, type Thought } from "application/thinking/thought";
import { EDITOR, type PageBox } from "./shareMarks";

/** A page's whole turn: its own `/Rotate` and yours, in quarter turns. */
export const turnOf = (own: number, yours = 0) => ((((own + yours) % 360) + 360) % 360) as 0 | 90 | 180 | 270;

/** The page's size as it is shown at `turn`, at scale 1. */
export function turnedSize(view: PageBox, turn: number): { W: number; H: number } {
    const w = view[2] - view[0];
    const h = view[3] - view[1];
    return turn % 180 === 90 ? { W: h, H: w } : { W: w, H: h };
}

/**
 * A point of the page as shown (`vx`, `vy` from its top left, at scale 1, at `turn`) in the page's own
 * user space: pdf.js's `convertToPdfPoint`, measured against pdf.js 5.3 for all four turns.
 */
export function pdfPointOf(view: PageBox, turn: number, vx: number, vy: number): [number, number] {
    const [x1, y1, x2, y2] = view;
    if (turn === 90) return [x1 + vy, y1 + vx];
    if (turn === 180) return [x2 - vx, y1 + vy];
    if (turn === 270) return [x2 - vy, y2 - vx];
    return [x1 + vx, y2 - vy];
}

/** `#rrggbb` as pdf.js's 0–255 colour. */
function rgbOf(hex: string): [number, number, number] {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function median(values: number[]): number {
    const sorted = [...values].sort((p, q) => p - q);
    return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
}

/** A drawing on a printed page: its place there and its strokes, in ems from that place. */
export interface PageDrawing {
    page: number;
    place: Pick<PageInkAnchor, "px" | "py">;
    strokes: readonly InkStrokeData[];
}

/**
 * What pdf.js is asked to write for a drawing (FR-3–FR-6): one `/Ink` per colour, each stroke its own
 * path — lines as lines, each curve raised exactly to the cubic pdf.js draws — at the width you drew.
 */
export function inkPayloads(drawing: PageDrawing, view: PageBox, turn: number, author?: string): Record<string, unknown>[] {
    const { W, H } = turnedSize(view, turn);
    const k = W / PAGE_EMS;
    const at = (x: number, y: number) => pdfPointOf(view, turn, drawing.place.px * W + x * k, drawing.place.py * H + y * k);
    const out: Record<string, unknown>[] = [];
    for (const colour of new Set(drawing.strokes.map((stroke) => stroke.colour))) {
        const strokes = drawing.strokes.filter((stroke) => stroke.colour === colour && stroke.points.length > 0);
        if (strokes.length === 0) continue;
        const lines: Float32Array[] = [];
        const points: Float32Array[] = [];
        const widths: number[] = [];
        const xs: number[] = [];
        const ys: number[] = [];
        for (const stroke of strokes) {
            const segments = segmentsOf(stroke.points, stroke.pointerType);
            widths.push(median(segments.map((segment) => segment.w)));
            const path: number[] = [NaN, NaN, NaN, NaN, ...at(...segments[0].from)];
            for (const segment of segments) {
                const to = at(...segment.to);
                if (segment.c) {
                    // A quadratic `from → c → to` is the cubic with its controls two thirds of the way to c.
                    const [fx, fy] = segment.from;
                    const [cx, cy] = segment.c;
                    const [tx, ty] = segment.to;
                    path.push(...at(fx + ((cx - fx) * 2) / 3, fy + ((cy - fy) * 2) / 3), ...at(tx + ((cx - tx) * 2) / 3, ty + ((cy - ty) * 2) / 3), ...to);
                } else path.push(NaN, NaN, NaN, NaN, ...to);
            }
            lines.push(new Float32Array(path));
            const raw = stroke.points.flatMap((point) => at(point.x, point.y));
            points.push(new Float32Array(raw));
            raw.forEach((value, i) => (i % 2 ? ys : xs).push(value));
        }
        const thickness = Math.max(0.5, median(widths) * k);
        const pad = thickness / 2;
        out.push({
            annotationType: EDITOR.INK,
            color: rgbOf(INK_FILE_COLOUR[colour]),
            opacity: 1,
            thickness,
            paths: { lines, points },
            rect: [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad],
            rotation: 0,
            pageIndex: drawing.page,
            structTreeParentId: null,
            ...(author ? { user: author } : {}),
        });
    }
    return out;
}

/** The pen of a PDF (FR-2, FR-8): the drawings that go on its copy, and how many drawn by the text stay. */
export interface SharePen {
    drawings: PageDrawing[];
    /** Ink notes kept from Page view: their drawings are read when the copy is made. */
    notes: Thought[];
    /** Drawn beside the reflowed text: no place on a printed page, so they stay off. */
    beside: number;
}

/**
 * What of the pen goes (FR-2): the book's page ink drawn in Page view — never a cluster erased since
 * (the rule `mergePageInk` applies) — and the ink notes kept from it. Ink drawn by the text is counted.
 */
export function penOf(ink: PageInk | null, thoughts: readonly Thought[]): SharePen {
    const drawings: PageDrawing[] = [];
    let beside = 0;
    for (const cluster of ink?.clusters ?? []) {
        if (cluster.strokes.length === 0 || (ink!.erased[cluster.id] ?? -Infinity) >= cluster.at) continue;
        if (cluster.place.view === "page") drawings.push({ page: cluster.place.locator.at, place: cluster.place, strokes: cluster.strokes });
        else beside++;
    }
    const notes: Thought[] = [];
    for (const thought of thoughts) {
        if (!isInk(thought) || thought.madeBy) continue;
        if (isPageInk(thought.ink!) && thought.locator) notes.push(thought);
        else beside++;
    }
    return { drawings, notes, beside };
}
