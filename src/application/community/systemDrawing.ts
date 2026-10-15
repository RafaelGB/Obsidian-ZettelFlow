import type { Cam } from "architecture/components/core/reader/readerShot";
import type { ZfTemplate } from "application/template/zfTemplate";
import type { StepSettings } from "zettelkasten";
import { templateGraph, type ParseYaml } from "./templateGraph";

/**
 * **A system, drawn as it is** (#799, epic #797) — pure geometry.
 *
 * The gallery showed a picture of a system: a PNG someone rendered once, which could drift from
 * the canvas it described and said nothing about what you were looking at. The room draws the
 * system's **own canvas** instead — its steps as boxes, coloured by the canvas colour and labelled,
 * and its edges as the curves the canvas draws — so the card, the stage and the canvas you land in
 * are one picture at three sizes.
 *
 * Nothing here touches the DOM: `systemDrawingView.ts` turns this into SVG, and `frameStep` /
 * `pointsAlong` give the walk its camera and its travelling dot.
 */

export type Side = "top" | "right" | "bottom" | "left";

/** The canvas JSON this reads — a system's template, or (S6) a canvas in your vault. */
export interface CanvasNodeLike {
    id: string;
    type?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    color?: string;
    file?: string;
    text?: string;
    zettelflowConfig?: string;
}

export interface CanvasEdgeLike {
    id: string;
    fromNode: string;
    toNode: string;
    fromSide?: string;
    toSide?: string;
    label?: string;
}

export interface CanvasLike {
    nodes?: CanvasNodeLike[];
    edges?: CanvasEdgeLike[];
}

/** What a step shows in its box: its name, its phase, the questions it asks. */
export interface DrawStep {
    label: string;
    phase?: string;
    asks?: string[];
}

export interface DrawnNode {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    /** A class name without the plugin prefix: `system-node--c1` … `--c6`, or the neutral one. */
    colorClass: string;
    label: string;
    phase?: string;
    asks: string[];
}

export interface DrawnEdge {
    id: string;
    from: string;
    to: string;
    /** The SVG path. */
    d: string;
    /** The cubic it draws: x0 y0, the two control points, x3 y3. */
    curve: [number, number, number, number, number, number, number, number];
    label?: string;
}

export interface SystemDrawing {
    viewBox: { x: number; y: number; width: number; height: number };
    nodes: DrawnNode[];
    edges: DrawnEdge[];
    /** How many steps it draws. */
    steps: number;
    /** Steps with more than one way out. */
    branches: number;
}

/** A colour the canvas does not number (a hex, or none): the theme's own quiet line. */
export const NEUTRAL_COLOR = "system-node--neutral";

/** Canvas colours `"1"`…`"6"` are Obsidian's `--canvas-color-N`; anything else is neutral. */
export function colorClass(color: string | undefined): string {
    return color && /^[1-6]$/.test(color) ? `system-node--c${color}` : NEUTRAL_COLOR;
}

const STILL: Cam = { s: 1, x: 0, y: 0 };

/** With no step table to hand: a node is a step when it carries a config or points at a note. */
export function isStepNode(node: CanvasNodeLike): boolean {
    if (typeof node.zettelflowConfig === "string" && node.zettelflowConfig.trim() !== "") return true;
    return node.type === "file" && typeof node.file === "string" && node.file.endsWith(".md");
}

function defaultStep(node: CanvasNodeLike): DrawStep {
    if (node.zettelflowConfig) {
        try {
            const config = JSON.parse(node.zettelflowConfig) as Partial<StepSettings>;
            if (typeof config.label === "string" && config.label.trim()) {
                return { label: config.label.trim(), ...(config.phase ? { phase: String(config.phase) } : {}) };
            }
        } catch {
            // A config that is not JSON is drawn by its id; the walk is what reads it properly.
        }
    }
    if (node.file) return { label: (node.file.split("/").pop() ?? node.file).replace(/\.md$/, "") };
    return { label: node.text?.split("\n")[0]?.trim() || node.id };
}

const round = (n: number) => Math.round(n * 10) / 10;

function anchor(node: DrawnNode, side: Side): [number, number] {
    switch (side) {
        case "top":
            return [node.x + node.w / 2, node.y];
        case "bottom":
            return [node.x + node.w / 2, node.y + node.h];
        case "left":
            return [node.x, node.y + node.h / 2];
        default:
            return [node.x + node.w, node.y + node.h / 2];
    }
}

const NORMAL: Record<Side, [number, number]> = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };

function isSide(value: unknown): value is Side {
    return value === "top" || value === "right" || value === "bottom" || value === "left";
}

/** Which sides two boxes meet on when the canvas did not say: the way the mockup's eye reads them. */
function guessSides(a: DrawnNode, b: DrawnNode): [Side, Side] {
    const dx = b.x + b.w / 2 - (a.x + a.w / 2);
    const dy = b.y + b.h / 2 - (a.y + a.h / 2);
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? ["right", "left"] : ["left", "right"];
    return dy >= 0 ? ["bottom", "top"] : ["top", "bottom"];
}

function curveBetween(a: DrawnNode, b: DrawnNode, fromSide: unknown, toSide: unknown): DrawnEdge["curve"] {
    const guessed = guessSides(a, b);
    const fs = isSide(fromSide) ? fromSide : guessed[0];
    const ts = isSide(toSide) ? toSide : guessed[1];
    const [x0, y0] = anchor(a, fs);
    const [x3, y3] = anchor(b, ts);
    const k = Math.min(250, Math.max(30, Math.hypot(x3 - x0, y3 - y0) / 2));
    const [n0x, n0y] = NORMAL[fs];
    const [n3x, n3y] = NORMAL[ts];
    return [x0, y0, x0 + n0x * k, y0 + n0y * k, x3 + n3x * k, y3 + n3y * k, x3, y3].map(round) as DrawnEdge["curve"];
}

export function systemDrawing(canvas: CanvasLike, steps?: ReadonlyMap<string, DrawStep>): SystemDrawing {
    const nodes: DrawnNode[] = [];
    for (const node of canvas.nodes ?? []) {
        if (!node || typeof node.id !== "string" || node.type === "link") continue;
        const step = steps ? steps.get(node.id) : isStepNode(node) ? defaultStep(node) : undefined;
        if (!step) continue;
        nodes.push({
            id: node.id,
            x: node.x ?? 0,
            y: node.y ?? 0,
            w: node.width ?? 250,
            h: node.height ?? 60,
            colorClass: colorClass(node.color),
            label: step.label,
            ...(step.phase ? { phase: step.phase } : {}),
            asks: step.asks ?? [],
        });
    }
    const byId = new Map(nodes.map((node) => [node.id, node]));

    const edges: DrawnEdge[] = [];
    for (const edge of canvas.edges ?? []) {
        const a = byId.get(edge?.fromNode);
        const b = byId.get(edge?.toNode);
        if (!a || !b || a === b) continue;
        const curve = curveBetween(a, b, edge.fromSide, edge.toSide);
        const [x0, y0, x1, y1, x2, y2, x3, y3] = curve;
        edges.push({
            id: edge.id,
            from: a.id,
            to: b.id,
            d: `M${x0},${y0} C${x1},${y1} ${x2},${y2} ${x3},${y3}`,
            curve,
            ...(edge.label ? { label: edge.label } : {}),
        });
    }

    const outgoing = new Map<string, number>();
    for (const edge of edges) outgoing.set(edge.from, (outgoing.get(edge.from) ?? 0) + 1);
    const branches = [...outgoing.values()].filter((count) => count > 1).length;

    return { viewBox: boxAround(nodes), nodes, edges, steps: nodes.length, branches };
}

/** The drawing's frame: every box, with room around it — a lone box gets more, so it is not a wall. */
function boxAround(nodes: DrawnNode[], pad?: number): SystemDrawing["viewBox"] {
    if (nodes.length === 0) return { x: 0, y: 0, width: 160, height: 90 };
    const room = pad ?? (nodes.length === 1 ? nodes[0].w * 0.45 : 70);
    const left = Math.min(...nodes.map((node) => node.x)) - room;
    const top = Math.min(...nodes.map((node) => node.y)) - room;
    const right = Math.max(...nodes.map((node) => node.x + node.w)) + room;
    const bottom = Math.max(...nodes.map((node) => node.y + node.h)) + room;
    return { x: round(left), y: round(top), width: round(right - left), height: round(bottom - top) };
}

/** What an action asks, in its author's words: its label, else its description, else its type. */
export function askOf(action: { type: string; description?: string; label?: unknown }): string {
    if (typeof action.label === "string" && action.label.trim()) return action.label;
    return action.description?.trim() || action.type;
}

/** The questions a step asks, in its own words. */
export function asksOf(settings: StepSettings | undefined): string[] {
    return (settings?.actions ?? []).filter((action) => action.hasUI).map((action) => askOf(action));
}

/** A system's template, drawn: the steps `templateGraph` reads, with their labels, phases and questions. */
export function drawingOf(template: ZfTemplate, parseYaml: ParseYaml): SystemDrawing {
    const graph = templateGraph(template, parseYaml);
    const steps = new Map<string, DrawStep>();
    for (const step of graph.rehearsal.steps) {
        const settings = graph.settings.get(step.id);
        steps.set(step.id, {
            label: step.label,
            ...(settings?.phase ? { phase: String(settings.phase) } : {}),
            asks: asksOf(settings),
        });
    }
    return systemDrawing(JSON.parse(template.canvas.content) as CanvasLike, steps);
}

/**
 * The camera that frames a step and its neighbours inside `frame` — the drawing drawn to fit the
 * frame first, as the stage draws it. A drawing of one box, or a neighbourhood that is the whole
 * drawing, needs no camera at all.
 */
export function frameStep(drawing: SystemDrawing, stepId: string, frame: { width: number; height: number }): Cam {
    if (drawing.nodes.length <= 1 || frame.width <= 0 || frame.height <= 0) return STILL;
    const near = new Set([stepId]);
    for (const edge of drawing.edges) {
        if (edge.from === stepId) near.add(edge.to);
        if (edge.to === stepId) near.add(edge.from);
    }
    const around = boxAround(drawing.nodes.filter((node) => near.has(node.id)), 90);
    const vb = drawing.viewBox;
    const base = Math.min(frame.width / vb.width, frame.height / vb.height);
    const ox = (frame.width - vb.width * base) / 2;
    const oy = (frame.height - vb.height * base) / 2;
    const left = (around.x - vb.x) * base + ox;
    const top = (around.y - vb.y) * base + oy;
    const width = around.width * base;
    const height = around.height * base;
    const s = Math.min(3, frame.width / width, frame.height / height);
    if (s <= 1.05) return STILL;
    const r = (n: number) => Math.round(n * 1000) / 1000;
    return { s: r(s), x: r(frame.width / 2 - (left + width / 2) * s), y: r(frame.height / 2 - (top + height / 2) * s) };
}

/** `n` points along an edge's curve, from its start to its end — the dot's path. */
export function pointsAlong(edge: DrawnEdge, n: number): { x: number; y: number }[] {
    const [x0, y0, x1, y1, x2, y2, x3, y3] = edge.curve;
    const count = Math.max(2, Math.floor(n));
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        const mt = 1 - t;
        const a = mt * mt * mt;
        const b = 3 * mt * mt * t;
        const c = 3 * mt * t * t;
        const d = t * t * t;
        points.push({ x: a * x0 + b * x1 + c * x2 + d * x3, y: a * y0 + b * y1 + c * y2 + d * y3 });
    }
    return points;
}
