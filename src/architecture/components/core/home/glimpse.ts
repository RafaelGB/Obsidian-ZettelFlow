import type { Graph3DData } from "architecture/knowledge/state";
import type { Rgba } from "architecture/components/core/graph/graphTheme";

/**
 * **The vault glimpse** (#705, epic #701): a tiny, calm picture of your vault on Home, drawn from
 * the same data the graph engine (#692) draws — the same communities, the same colours — so Home
 * and Explore show one vault. It is a glimpse, not a graph: no labels, no edges, no layout run.
 * Each region is a soft nebula; the notes of this week pulse. Clicking it opens Explore.
 *
 * Pure: graph data in, points out; points and a canvas context in, one frame drawn. The view
 * (`HomeGlimpse`) owns the loop, and draws only while the glimpse is on screen.
 */
export interface GlimpsePoint {
    /** 0..1 across and down the glimpse. */
    x: number;
    y: number;
    /** The community's palette slot, the same slot Explore colours it with. */
    slot: number;
    /** Written this week: it pulses. */
    fresh: boolean;
    /** A phase, so the drift is not in lockstep. */
    phase: number;
}

export interface GlimpseRegion {
    x: number;
    y: number;
    /** The nebula's radius, as a share of the glimpse's width. */
    r: number;
    slot: number;
}

export interface Glimpse {
    points: GlimpsePoint[];
    regions: GlimpseRegion[];
    fresh: number;
}

/** Enough to read as a vault and never enough to cost a frame (#705: under 2 ms, measured). */
export const GLIMPSE_MAX_POINTS = 600;
const MAX_REGIONS = 8;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** A stable 0..1 from a string — the same note always sits in the same place. */
function hash01(text: string): number {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 100_000) / 100_000;
}

/**
 * Where everything sits: the largest regions on a gentle ellipse around the middle, their notes
 * scattered inside them by a hash of the path, so the picture is the same every time you open Home
 * and moves only when the vault does. Sampled to {@link GLIMPSE_MAX_POINTS}, keeping this week's.
 */
export function glimpseOf(data: Graph3DData, now: number): Glimpse {
    const notes = data.nodes.filter((node) => node.kind === "note");
    const sizes = new Map<number, number>();
    for (const node of notes) sizes.set(node.community, (sizes.get(node.community) ?? 0) + 1);
    const ranked = [...sizes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, MAX_REGIONS);
    const largest = Math.max(1, ...ranked.map(([, size]) => size));
    const regions = new Map<number, GlimpseRegion>();
    ranked.forEach(([community, size], index) => {
        const angle = (index / Math.max(1, ranked.length)) * Math.PI * 2 + 0.6;
        const ring = ranked.length === 1 ? 0 : 0.28;
        regions.set(community, {
            x: 0.5 + Math.cos(angle) * ring,
            y: 0.5 + Math.sin(angle) * ring * 0.7,
            r: 0.07 + 0.09 * Math.sqrt(size / largest),
            slot: community,
        });
    });

    const fresh = notes.filter((node) => node.created >= now - WEEK_MS);
    const rest = notes.filter((node) => node.created < now - WEEK_MS);
    const room = Math.max(0, GLIMPSE_MAX_POINTS - fresh.length);
    const step = rest.length > room ? rest.length / Math.max(1, room) : 1;
    const sampled = fresh.slice(0, GLIMPSE_MAX_POINTS);
    for (let i = 0; i < rest.length && sampled.length < GLIMPSE_MAX_POINTS; i += step) sampled.push(rest[Math.floor(i)]);

    const points: GlimpsePoint[] = [];
    for (const node of sampled) {
        const region = regions.get(node.community);
        const a = hash01(node.id) * Math.PI * 2;
        const d = Math.sqrt(hash01(`${node.id}#`));
        const centre = region ?? { x: 0.5 + (hash01(`${node.id}x`) - 0.5) * 0.9, y: 0.5 + (hash01(`${node.id}y`) - 0.5) * 0.8, r: 0.02 };
        points.push({
            x: centre.x + Math.cos(a) * d * centre.r,
            y: centre.y + Math.sin(a) * d * centre.r * 0.8,
            slot: region ? node.community : -1,
            fresh: node.created >= now - WEEK_MS,
            phase: hash01(`${node.id}~`) * Math.PI * 2,
        });
    }
    return { points, regions: [...regions.values()], fresh: fresh.length };
}

/** The canvas calls one frame needs — a structural subset, so a test can count them. */
export interface GlimpseContext {
    globalCompositeOperation: string;
    fillStyle: unknown;
    strokeStyle: unknown;
    lineWidth: number;
    clearRect(x: number, y: number, w: number, h: number): void;
    beginPath(): void;
    arc(x: number, y: number, r: number, a: number, b: number): void;
    fill(): void;
    stroke(): void;
    createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): { addColorStop(offset: number, colour: string): void };
}

export interface GlimpseColours {
    dark: boolean;
    /** The colour of a community's slot — `communityRgba` from the graph's own theme. */
    slot(slot: number): Rgba;
}

function rgba(colour: Rgba, alpha: number): string {
    const [r, g, b] = colour;
    return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${Math.max(0, Math.min(1, alpha))})`;
}

/**
 * One frame at time `t` (seconds; frozen at 0 under reduced motion). Radii are clamped, so a canvas
 * that is momentarily zero-sized never throws.
 */
export function drawGlimpse(ctx: GlimpseContext, glimpse: Glimpse, colours: GlimpseColours, w: number, h: number, t: number): void {
    ctx.clearRect(0, 0, w, h);
    if (w <= 0 || h <= 0) return;
    ctx.globalCompositeOperation = colours.dark ? "lighter" : "source-over";
    for (const region of glimpse.regions) {
        const radius = Math.max(1, region.r * w * 1.3);
        const colour = colours.slot(region.slot);
        const gradient = ctx.createRadialGradient(region.x * w, region.y * h, 0, region.x * w, region.y * h, radius);
        gradient.addColorStop(0, rgba(colour, colours.dark ? 0.22 : 0.12));
        gradient.addColorStop(1, rgba(colour, 0));
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(region.x * w, region.y * h, radius, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    for (const point of glimpse.points) {
        const x = (point.x + Math.sin(t * 0.3 + point.phase) * 0.004) * w;
        const y = (point.y + Math.cos(t * 0.27 + point.phase) * 0.006) * h;
        const colour = colours.slot(point.slot);
        ctx.fillStyle = rgba(colour, point.fresh ? 0.95 : 0.7);
        ctx.beginPath();
        ctx.arc(x, y, point.fresh ? 2.4 : 1.4, 0, Math.PI * 2);
        ctx.fill();
        if (!point.fresh) continue;
        const pulse = 0.5 + 0.5 * Math.sin(t * 2 + point.phase);
        ctx.strokeStyle = rgba(colour, 0.5 * (1 - pulse));
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.5, 3 + pulse * 7), 0, Math.PI * 2);
        ctx.stroke();
    }
}
