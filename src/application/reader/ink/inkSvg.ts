/**
 * **The drawing's file** (#745 E3, epic #740) — pure.
 *
 * An ink note's drawing is one SVG file in the thinking space, beside its thought. The visible paths
 * are drawn from the raw points, and the points themselves live **inside the same file**, as versioned
 * JSON in its `<metadata>`: one file, one source of truth. Anything that opens an SVG (Obsidian, a
 * browser, Finder's preview) shows the handwriting; the Reader re-draws it from the points, so it can
 * erase a stroke whole, re-scale it with the text, and — in later slices — recognise and read it.
 *
 * The string is written and read by hand, as a thought's frontmatter is. The Reader never inserts a
 * file's SVG as markup: it parses the points and draws them itself.
 */

import { mergedPaths, pointsBox, segmentsOf, INK_WIDTH_EM, TILT_CAP, type InkPoint } from "./inkStroke";

/** The ink colours the palette offers, by name. The Reader draws each from the theme (§XV). */
export const INK_COLOURS = ["pencil", "red", "blue", "green"] as const;
export type InkColour = (typeof INK_COLOURS)[number];

/** The version of the points' format this build writes and understands. */
export const INK_VERSION = 1;
/** Points are kept to this many decimals of an em: the round trip is lossless at it (AC-3). */
export const INK_PRECISION = 3;
/** The id of the `<metadata>` element holding the points. */
export const INK_METADATA_ID = "zettelflow-ink";

/**
 * A plain colour per name for viewers **outside** the Reader. This is a data file, not a stylesheet:
 * inside the Reader every name is the theme's own variable.
 */
const FILE_COLOUR: Record<InkColour, string> = {
    // A mid grey: legible on a light page and on a dark one, wherever the file is embedded.
    pencil: "#8a8a8a",
    red: "#d9383c",
    blue: "#2f7de1",
    green: "#2f9e57",
};

export interface InkStrokeData {
    colour: InkColour;
    /** The pointer that wrote it: a mouse writes a steady width. */
    pointerType: string;
    /** In ems, from the ink note's origin. */
    points: InkPoint[];
}

export interface InkDrawing {
    strokes: InkStrokeData[];
}

export interface UnreadableInk {
    unreadable: true;
    version: number | null;
}

export function isInkColour(value: unknown): value is InkColour {
    return typeof value === "string" && (INK_COLOURS as readonly string[]).includes(value);
}

const fix = (n: number) => Math.round(n * 10 ** INK_PRECISION) / 10 ** INK_PRECISION;

/** A drawing's points at the kept precision: what the file holds and the round trip returns. */
export function keptPoints(points: readonly InkPoint[]): InkPoint[] {
    return points.map((pt) => ({ x: fix(pt.x), y: fix(pt.y), p: fix(pt.p), tilt: fix(pt.tilt), t: Math.round(pt.t) }));
}

/** The box the drawing covers, in ems, with room for the widest nib. */
export function drawingBox(drawing: InkDrawing): { left: number; top: number; right: number; bottom: number } {
    const all = drawing.strokes.flatMap((stroke) => stroke.points);
    return pointsBox(all, INK_WIDTH_EM * 2 * TILT_CAP);
}

const n = (value: number) => String(fix(value));

/** The drawing as an SVG file. A pure function of the points: two renders are byte-equal. */
export function renderInkSvg(drawing: InkDrawing): string {
    const strokes = drawing.strokes.map((stroke) => ({ ...stroke, colour: isInkColour(stroke.colour) ? stroke.colour : "pencil", points: keptPoints(stroke.points) }));
    const box = drawingBox({ strokes });
    const width = Math.max(0.01, box.right - box.left);
    const height = Math.max(0.01, box.bottom - box.top);
    const data = {
        v: INK_VERSION,
        strokes: strokes.map((stroke) => ({
            c: stroke.colour,
            t: stroke.pointerType,
            pts: stroke.points.map((pt) => [pt.x, pt.y, pt.p, pt.tilt, pt.t]),
        })),
    };
    const lines = [
        // 16 px to the em outside the Reader: the size it was written at, near enough.
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(box.left)} ${n(box.top)} ${n(width)} ${n(height)}" width="${n(width * 16)}" height="${n(height * 16)}">`,
        `<metadata id="${INK_METADATA_ID}">${JSON.stringify(data)}</metadata>`,
        `<g fill="none" stroke-linecap="round" stroke-linejoin="round">`,
    ];
    for (const stroke of strokes) {
        for (const path of mergedPaths(segmentsOf(stroke.points, stroke.pointerType), INK_PRECISION)) {
            lines.push(`<path data-ink="${stroke.colour}" stroke="${FILE_COLOUR[stroke.colour]}" stroke-width="${n(path.w)}" d="${path.d}"/>`);
        }
    }
    lines.push("</g>", "</svg>", "");
    return lines.join("\n");
}

function finite(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readPoint(raw: unknown): InkPoint | null {
    if (!Array.isArray(raw) || raw.length < 2) return null;
    const [x, y, p, tilt, t] = raw.map(finite);
    if (x === null || y === null) return null;
    return { x, y, p: p ?? 0.5, tilt: tilt ?? Math.PI / 2, t: t ?? 0 };
}

/**
 * Read a drawing back from its file. Only our own metadata is read — the visible paths are never
 * trusted, and nothing else in the file is looked at. A version this build does not know is kept as
 * `unreadable`, so it is listed rather than thrown away (AC-3).
 */
export function parseInkSvg(text: string): InkDrawing | UnreadableInk {
    const match = new RegExp(`<metadata id="${INK_METADATA_ID}">([\\s\\S]*?)</metadata>`).exec(text);
    if (!match) return { unreadable: true, version: null };
    let data: unknown;
    try {
        data = JSON.parse(match[1]);
    } catch {
        return { unreadable: true, version: null };
    }
    if (!data || typeof data !== "object") return { unreadable: true, version: null };
    const record = data as { v?: unknown; strokes?: unknown };
    const version = finite(record.v);
    if (version !== INK_VERSION || !Array.isArray(record.strokes)) return { unreadable: true, version };
    const strokes: InkStrokeData[] = [];
    for (const raw of record.strokes) {
        if (!raw || typeof raw !== "object") continue;
        const stroke = raw as { c?: unknown; t?: unknown; pts?: unknown };
        const points = Array.isArray(stroke.pts) ? stroke.pts.map(readPoint).filter((pt): pt is InkPoint => pt !== null) : [];
        if (points.length === 0) continue;
        strokes.push({
            colour: isInkColour(stroke.c) ? stroke.c : "pencil",
            pointerType: typeof stroke.t === "string" && /^[a-z]{1,10}$/.test(stroke.t) ? stroke.t : "pen",
            points,
        });
    }
    return { strokes };
}

export function isUnreadable(drawing: InkDrawing | UnreadableInk): drawing is UnreadableInk {
    return "unreadable" in drawing;
}
