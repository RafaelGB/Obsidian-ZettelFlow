import type { NearNote, Neighbour, NeighbourClass } from "architecture/knowledge/state";

/**
 * Where the neighbourhood graph puts things (#643 FR-5/7/8) — pure geometry, no DOM, no `obsidian`.
 *
 * A viewBox as wide as the pane it is drawn in (measured; 360 when it cannot be), so one unit is one
 * pixel and a label is drawn at the theme's small UI size instead of being scaled down to ~8px in
 * a sidebar (#639 runtime audit). The note sits in
 * the centre; its neighbours on an inner ellipse, clockwise from twelve o'clock in the order the
 * projection gives; the near-but-unlinked notes on an outer ring, half a step round so they never
 * sit on a neighbour's spoke. Radii are chosen so a node and its longest label stay in the box.
 */

/** At most this many neighbours are drawn; the rest are counted (+N more) and listed (FR-7). */
export const CAP = 12;
/** The most a label ever shows, however wide the pane; narrower panes show fewer. */
export const LABEL_CHARS = 16;
/** The fewest a label shows before the graph would rather shrink its rings. */
const MIN_LABEL_CHARS = 6;
/** The estimated width of one Latin character of a label, in pixels (labels are ~12px). */
export const CHAR_W = 7;

/** The width assumed when the pane cannot be measured (hidden, or under a test runner). */
export const DEFAULT_WIDTH = 360;
const HEIGHT = 220;
/** The gap between a node and its label. */
const GAP = 8;
const NODE_R = 6;

export interface LayoutNode {
    path: string;
    title: string;
    /** What is drawn — the title, cut to {@link LABEL_CHARS}. */
    label: string;
    x: number;
    y: number;
    labelX: number;
    labelY: number;
    anchor: "start" | "middle" | "end";
    cls: NeighbourClass | "near";
    isNear: boolean;
    /** The neighbour itself, for its accessible name and its edge; absent on the near ring. */
    neighbour?: Neighbour;
}

export interface NeighbourhoodLayout {
    width: number;
    /** How many Latin characters a label may show in this width (a wide glyph counts as two). */
    labelChars: number;
    height: number;
    cx: number;
    cy: number;
    /** The outer ring's radii — the scale the graph is measured against. */
    rx: number;
    ry: number;
    nodes: LayoutNode[];
    /** Neighbours past the cap, not drawn. */
    overflow: number;
}

/** CJK, Hangul, full-width forms and astral symbols take about two Latin characters' width. */
const WIDE = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/u;

/** How many Latin character widths `ch` takes. */
export function glyphUnits(ch: string): number {
    return WIDE.test(ch) || (ch.codePointAt(0) ?? 0) > 0xffff ? 2 : 1;
}

/** Cut `title` to `budget` character widths, with an ellipsis — wide glyphs count double. */
export function cut(title: string, budget: number): string {
    let used = 0;
    let out = "";
    for (const ch of title) {
        used += glyphUnits(ch);
        if (used > budget) return `${out}…`;
        out += ch;
    }
    return out;
}

function place(angle: number, rx: number, ry: number, cx: number, cy: number) {
    const cos = Math.cos(angle);
    const x = cx + rx * cos;
    const y = cy + ry * Math.sin(angle);
    if (Math.abs(cos) < 0.2) {
        // Above or below the centre: the label sits over or under the node, centred.
        return { x, y, anchor: "middle" as const, labelX: x, labelY: y < cy ? y - NODE_R - 4 : y + NODE_R + 11 };
    }
    return cos > 0
        ? { x, y, anchor: "start" as const, labelX: x + GAP, labelY: y + 4 }
        : { x, y, anchor: "end" as const, labelX: x - GAP, labelY: y + 4 };
}

export function layoutNeighbourhood(
    neighbours: readonly Neighbour[],
    near: readonly NearNote[],
    width: number = DEFAULT_WIDTH
): NeighbourhoodLayout {
    const WIDTH = Math.max(200, Math.round(width));
    const cx = WIDTH / 2;
    const cy = HEIGHT / 2;
    // Labels get what is left once the rings keep ~42% of the half-width: a narrow sidebar shows
    // shorter labels at full size rather than full labels too small to read.
    const labelChars = Math.min(
        LABEL_CHARS,
        Math.max(MIN_LABEL_CHARS, Math.floor((cx * 0.58 - GAP) / CHAR_W) - 1)
    );
    // The widest label is labelChars plus the ellipsis; the outer ring keeps it inside the box.
    const longest = (labelChars + 1) * CHAR_W;
    const rx = cx - GAP - longest;
    const ry = cy - NODE_R - 4 - 12;
    const innerRx = rx * 0.68;
    const innerRy = ry * 0.68;

    const drawn = neighbours.slice(0, CAP);
    const n = drawn.length;
    const step = n > 0 ? (2 * Math.PI) / n : 0;
    const nodes: LayoutNode[] = drawn.map((neighbour, i) => ({
        path: neighbour.path,
        title: neighbour.title,
        label: cut(neighbour.title, labelChars),
        cls: neighbour.cls,
        isNear: false,
        neighbour,
        ...place(-Math.PI / 2 + i * step, innerRx, innerRy, cx, cy),
    }));

    // Half a step round from the neighbours, so a near note never sits on a neighbour's spoke.
    // With no neighbours there is nothing to avoid: spread them evenly from twelve o'clock.
    const k = near.length;
    near.forEach((note, i) => {
        const angle = n > 0 ? -Math.PI / 2 + step / 2 + i * step : -Math.PI / 2 + (i * 2 * Math.PI) / k;
        nodes.push({
            path: note.path,
            title: note.title,
            label: cut(note.title, labelChars),
            cls: "near",
            isNear: true,
            ...place(angle, rx, ry, cx, cy),
        });
    });

    return {
        width: WIDTH,
        height: HEIGHT,
        labelChars,
        cx,
        cy,
        rx,
        ry,
        nodes,
        overflow: Math.max(0, neighbours.length - CAP),
    };
}
