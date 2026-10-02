import type { NearNote, Neighbour, NeighbourClass } from "architecture/knowledge/state";

/**
 * Where the neighbourhood graph puts things (#643 FR-5/7/8) — pure geometry, no DOM, no `obsidian`.
 *
 * A fixed viewBox the SVG scales into, so the graph fills whatever column it is in. The note sits in
 * the centre; its neighbours on an inner ellipse, clockwise from twelve o'clock in the order the
 * projection gives; the near-but-unlinked notes on an outer ring, half a step round so they never
 * sit on a neighbour's spoke. Radii are chosen so a node and its longest label stay in the box.
 */

/** At most this many neighbours are drawn; the rest are counted (+N more) and listed (FR-7). */
export const CAP = 12;
/** A label longer than this is cut, with an ellipsis. */
export const LABEL_CHARS = 14;
/** The estimated width of one character of a label, in viewBox units (labels are ~10 units high). */
export const CHAR_W = 5.6;

const WIDTH = 360;
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

function cut(title: string): string {
    return title.length > LABEL_CHARS ? `${title.slice(0, LABEL_CHARS)}…` : title;
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

export function layoutNeighbourhood(neighbours: readonly Neighbour[], near: readonly NearNote[]): NeighbourhoodLayout {
    const cx = WIDTH / 2;
    const cy = HEIGHT / 2;
    // The widest label is LABEL_CHARS plus the ellipsis; the outer ring keeps it inside the box.
    const longest = (LABEL_CHARS + 1) * CHAR_W;
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
        label: cut(neighbour.title),
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
            label: cut(note.title),
            cls: "near",
            isNear: true,
            ...place(angle, rx, ry, cx, cy),
        });
    });

    return { width: WIDTH, height: HEIGHT, cx, cy, rx, ry, nodes, overflow: Math.max(0, neighbours.length - CAP) };
}
