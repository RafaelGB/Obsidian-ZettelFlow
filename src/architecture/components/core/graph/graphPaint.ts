import type { GraphScene } from "./graphScene";
import { communityRgba, relationRgba, stateRgba, type GraphTheme, type Rgba } from "./graphTheme";

/** What a note is coloured by: the region it lives in, or how far along it is. */
export type ColorBy = "region" | "state";

/** A lens about links: which edges an answer is *about* (#696, #697). */
export type EdgeAsk = "bridges" | "contradicts" | null;

/** Everything that decides a frame's colours — and nothing that decides where things are. */
export interface PaintState {
    colorBy: ColorBy;
    /** The answer, as scene indices: lit, and everything else dims. `null` when nothing is asked. */
    lit: ReadonlySet<number> | null;
    /** A note you clicked and its neighbours — it wins over the answer while it is open. */
    focus: ReadonlySet<number> | null;
    /** How far the dimming has eased in, `0..1` — so asking fades rather than snaps. */
    fade: number;
    /** Notes created after this moment are not there yet (#697). `Infinity` shows everything. */
    timeCursor: number;
    edgeAsk: EdgeAsk;
    /** Notes the hub ranking puts first: they glow a little when nothing is asked. */
    hubs: ReadonlySet<number>;
}

/** Edge flags the shaders read: a dashed line, and light travelling along it. */
export const EDGE_DASHED = 1;
export const EDGE_TRAVEL = 2;
/** A ghost: a pair that might connect and does not (#532) — dashed, in the theme's pink. */
export const EDGE_GHOST = 4;

/**
 * The paint buffers (#695): every colour, size and glow of a frame as typed arrays the GPU reads
 * straight. Allocated once per scene; a hover rewrites numbers in place and builds nothing.
 */
export interface PaintBuffers {
    /** Straight (not premultiplied) RGBA per note. */
    nodeColor: Float32Array;
    /** Dot radius in CSS pixels, before perspective. */
    nodeSize: Float32Array;
    /** Halo strength, `0` for none. */
    nodeGlow: Float32Array;
    edgeColor: Float32Array;
    edgeWidth: Float32Array;
    edgeFlags: Float32Array;
    /** Ghost pairs appended after the scene's links (`edgeColor` etc. cover both). */
    ghosts: number;
}

export function allocatePaint(scene: GraphScene, ghostCapacity: number): PaintBuffers {
    const edges = scene.edges.length / 2 + ghostCapacity;
    return {
        nodeColor: new Float32Array(scene.n * 4),
        nodeSize: new Float32Array(scene.n),
        nodeGlow: new Float32Array(scene.n),
        edgeColor: new Float32Array(edges * 4),
        edgeWidth: new Float32Array(edges),
        edgeFlags: new Float32Array(edges),
        ghosts: 0,
    };
}

/** Is note `i` there at the current moment? A note with no known creation time always is. */
export function present(scene: GraphScene, i: number, cursor: number): boolean {
    const created = scene.created[i];
    return created === 0 || created <= cursor;
}

function write(out: Float32Array, at: number, c: Rgba, alpha: number): void {
    out[at] = c[0];
    out[at + 1] = c[1];
    out[at + 2] = c[2];
    out[at + 3] = alpha;
}

/**
 * Paint every note and link for `state`, into `out`. Pure apart from writing `out`, and `O(n + e)`:
 * the whole of a hover (#695 budget `view.graph.paint.10k`).
 *
 * `ghosts` are pairs of scene indices drawn after the links, for the "might connect" question.
 */
export function paint(
    scene: GraphScene,
    theme: GraphTheme,
    state: PaintState,
    out: PaintBuffers,
    ghosts: Uint32Array = new Uint32Array(0)
): void {
    const { lit, focus, colorBy, timeCursor, edgeAsk } = state;
    const asked = focus ?? lit;
    const w = focus ? 1 : lit ? state.fade : 0;
    const hot = (i: number): boolean => (asked ? asked.has(i) : true);
    const dim = theme.faint;

    for (let i = 0; i < scene.n; i++) {
        const base = colorBy === "region" ? communityRgba(theme, scene.community[i]) : stateRgba(theme, scene.state[i]);
        const size = 2.1 + Math.sqrt(scene.degree[i]) * 1.25;
        if (!present(scene, i, timeCursor)) {
            write(out.nodeColor, i * 4, base, 0);
            out.nodeSize[i] = 0;
            out.nodeGlow[i] = 0;
            continue;
        }
        if (!asked) {
            write(out.nodeColor, i * 4, base, 1);
            out.nodeSize[i] = size;
            out.nodeGlow[i] = state.hubs.has(i) ? 1 : 0.55;
            continue;
        }
        if (hot(i)) {
            write(out.nodeColor, i * 4, base, 1);
            out.nodeSize[i] = size * (1 + 0.25 * w);
            out.nodeGlow[i] = 0.9 + 0.5 * w;
        } else {
            // Dimmed toward the theme's faintest text — the rest of the vault stays there, quietly.
            const t = w;
            out.nodeColor[i * 4] = base[0] + (dim[0] - base[0]) * t;
            out.nodeColor[i * 4 + 1] = base[1] + (dim[1] - base[1]) * t;
            out.nodeColor[i * 4 + 2] = base[2] + (dim[2] - base[2]) * t;
            out.nodeColor[i * 4 + 3] = 1 - 0.82 * t;
            out.nodeSize[i] = size * (1 - 0.35 * t);
            out.nodeGlow[i] = (state.hubs.has(i) ? 1 : 0.55) * (1 - t);
        }
    }

    const links = scene.edges.length / 2;
    for (let l = 0; l < links; l++) {
        const a = scene.edges[l * 2], b = scene.edges[l * 2 + 1];
        const at = l * 4;
        const type = scene.edgeType[l];
        const isBridge = scene.bridge[l] === 1;
        let colour = relationRgba(theme, type);
        if (!present(scene, a, timeCursor) || !present(scene, b, timeCursor)) {
            write(out.edgeColor, at, colour, 0);
            out.edgeWidth[l] = 0;
            out.edgeFlags[l] = 0;
            continue;
        }
        let flags = 0;
        if (!asked) {
            write(out.edgeColor, at, colour, theme.dark ? 0.22 : 0.3);
            out.edgeWidth[l] = 0.9;
            if (isBridge) flags |= EDGE_DASHED;
            out.edgeFlags[l] = flags;
            continue;
        }
        const matchesAsk = edgeAsk === null || (edgeAsk === "bridges" ? isBridge : type === "contradicts");
        const on = hot(a) && hot(b) && (focus !== null || matchesAsk);
        if (on && type === "contradicts") colour = theme.red;
        if (on && edgeAsk === "bridges" && isBridge) {
            colour = theme.accent;
            flags |= EDGE_TRAVEL;
        } else if (isBridge) {
            flags |= EDGE_DASHED;
        }
        write(out.edgeColor, at, colour, on ? 0.25 + 0.55 * w : 0.1 * (1 - w) + 0.025);
        out.edgeWidth[l] = on ? 1.4 + 0.9 * w : 0.7;
        out.edgeFlags[l] = flags;
    }

    out.ghosts = ghosts.length / 2;
    for (let g = 0; g < out.ghosts; g++) {
        const at = (links + g) * 4;
        write(out.edgeColor, at, theme.pink, 0.35 + 0.45 * w);
        out.edgeWidth[links + g] = 1.6;
        out.edgeFlags[links + g] = EDGE_DASHED | EDGE_GHOST;
    }
}
