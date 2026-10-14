import { c } from "architecture";
import { MOTION, motionWelcome } from "architecture/components/core/reader/readerMotion";
import { camCss, type Cam } from "architecture/components/core/reader/readerShot";
import { pointsAlong, type DrawnEdge, type SystemDrawing } from "../systemDrawing";
import { ownWindow } from "./communityPan";

/**
 * **The drawing, drawn** (#799): a system's own canvas as SVG — the same picture on the card, on the
 * stage and in the ghost that flies between them.
 *
 * Built with `createSvg` (never markup in a string); colours are classes over Obsidian's own canvas
 * colours, so the drawing wears the user's theme. The camera is a wrapper whose `transform` is a
 * custom property — the Reader's `Cam` — and the walk's dot moves by transform keyframes only.
 */

export type DrawingMode = "thumb" | "full";

/** The custom property the camera's transform reads. */
export const CAM_PROP = "--zf-system-cam";

export interface DrawingView {
    /** The frame: the drawing's box on the page. */
    el: HTMLElement;
    /** What the camera moves. */
    camera: HTMLElement;
    svg: SVGSVGElement;
    nodes: Map<string, SVGGElement>;
    edges: Map<string, SVGPathElement>;
    drawing: SystemDrawing;
}

/** Words that fit a box this wide, in at most `lines` lines. */
function wrap(text: string, max: number, lines: number): string[] {
    const out: string[] = [];
    let line = "";
    for (const word of text.split(/\s+/).filter(Boolean)) {
        if (`${line} ${word}`.trim().length > max && line) {
            out.push(line);
            line = word;
        } else line = `${line} ${word}`.trim();
    }
    if (line) out.push(line);
    if (out.length > lines) {
        const kept = out.slice(0, lines);
        kept[lines - 1] = `${kept[lines - 1].slice(0, Math.max(1, max - 1))}…`;
        return kept;
    }
    return out;
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** A line of SVG text: `createSvg` takes no text, so it is set on the element it made. */
function svgText(parent: SVGElement, cls: string, text: string, attr: Record<string, string>): SVGTextElement {
    const el = parent.createSvg("text", { cls: c(cls), attr });
    el.setText(text);
    return el;
}

export function drawSystem(parent: HTMLElement, drawing: SystemDrawing, mode: DrawingMode): DrawingView {
    const el = parent.createDiv({ cls: [c("system-drawing"), mode === "thumb" ? "is-thumb" : "is-full"].join(" ") });
    const camera = el.createDiv({ cls: c("system-drawing-camera") });
    const { x, y, width, height } = drawing.viewBox;
    const svg = camera.createSvg("svg", {
        cls: c("system-drawing-svg"),
        attr: { viewBox: `${x} ${y} ${width} ${height}`, preserveAspectRatio: "xMidYMid meet", "aria-hidden": "true", focusable: "false" },
    });
    const nodes = new Map<string, SVGGElement>();
    const edges = new Map<string, SVGPathElement>();

    const edgeLayer = svg.createSvg("g", { cls: c("system-edges") });
    for (const edge of drawing.edges) {
        edges.set(edge.id, edgeLayer.createSvg("path", { cls: c("system-edge"), attr: { d: edge.d, "data-edge": edge.id } }));
        if (edge.label && mode === "full") {
            const [x0, y0, , , , , x3, y3] = edge.curve;
            svgText(edgeLayer, "system-edge-label", clip(edge.label, 28), {
                x: String(Math.round((x0 + x3) / 2)),
                y: String(Math.round((y0 + y3) / 2) - 10),
                "text-anchor": "middle",
                "font-size": "20",
            });
        }
    }

    for (const node of drawing.nodes) {
        const group = svg.createSvg("g", { cls: [c("system-node"), c(node.colorClass)], attr: { "data-node": node.id } });
        group.createSvg("rect", {
            cls: c("system-node-box"),
            attr: { x: String(node.x), y: String(node.y), width: String(node.w), height: String(node.h), rx: "14" },
        });
        let line = node.y + 40;
        const left = String(node.x + 22);
        if (node.phase) {
            svgText(group, "system-node-phase", node.phase, { x: left, y: String(line), "font-size": "20" });
            line += 36;
        }
        const perLine = Math.max(8, Math.floor((node.w - 44) / 16));
        for (const text of wrap(node.label, perLine, 2)) {
            svgText(group, "system-node-label", text, { x: left, y: String(line), "font-size": "30" });
            line += 36;
        }
        const room = Math.max(0, Math.floor((node.y + node.h - line) / 28));
        for (const ask of node.asks.slice(0, room)) {
            svgText(group, "system-node-ask", `· ${clip(ask, perLine + 6)}`, { x: left, y: String(line + 4), "font-size": "22" });
            line += 28;
        }
        nodes.set(node.id, group);
    }
    return { el, camera, svg, nodes, edges, drawing };
}

/** Where the walk stands: the current step, the steps walked, and the edges taken. */
export function markWalk(view: DrawingView, current: string | undefined, visited: ReadonlySet<string>, taken: ReadonlySet<string>): void {
    view.el.addClass("is-walking");
    for (const [id, group] of view.nodes) {
        group.toggleClass("is-current", id === current);
        group.toggleClass("is-visited", visited.has(id));
    }
    for (const [id, path] of view.edges) path.toggleClass("is-taken", taken.has(id));
}

/** The camera, at rest. */
export function placeCamera(view: DrawingView, cam: Cam): void {
    view.camera.setCssProps({ [CAM_PROP]: camCss(cam) });
}

/** The camera's move, by transform: from where it is to `to`. Instant where motion is not welcome. */
export function moveCamera(view: DrawingView, from: Cam, to: Cam, duration: number): Animation | null {
    placeCamera(view, to);
    if (!motionWelcome(view.camera)) return null;
    return view.camera.animate([{ transform: camCss(from) }, { transform: camCss(to) }], { duration, easing: MOTION.ease }) ?? null;
}

/** A dot along an edge — translate keyframes sampled from its curve, then gone. */
export function travelDot(view: DrawingView, edge: DrawnEdge, duration: number): Animation | null {
    if (!motionWelcome(view.camera)) return null;
    const dot = view.svg.createSvg("circle", { cls: c("system-dot"), attr: { r: "14", cx: "0", cy: "0" } });
    const frames = pointsAlong(edge, 24).map((point) => ({ transform: `translate(${Math.round(point.x)}px, ${Math.round(point.y)}px)` }));
    const animation = dot.animate(frames, { duration, easing: MOTION.ease, fill: "forwards" }) ?? null;
    const gone = () => dot.remove();
    if (!animation) {
        gone();
        return null;
    }
    animation.onfinish = gone;
    ownWindow(view.el).setTimeout(gone, duration + 300);
    return animation;
}
