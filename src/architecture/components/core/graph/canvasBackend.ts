import { projectPoint, type Projected } from "./graphCamera";
import { EDGE_DASHED, EDGE_TRAVEL } from "./graphPaint";
import type { FrameInput, GraphBackend } from "./graphFrame";
import { cssRgb, type Rgba } from "./graphTheme";

/**
 * The 2D canvas renderer (#693): what draws when the device has no WebGL2 — an old GPU, a locked
 * down machine, a context the browser refused. Same frame, same colours, same picture, drawn by the
 * CPU; slower past a few thousand notes, and still a graph rather than a blank view or a list.
 */
export function createCanvasBackend(canvas: HTMLCanvasElement): GraphBackend | null {
    let ctx: CanvasRenderingContext2D | null = null;
    try {
        ctx = canvas.getContext("2d");
    } catch {
        ctx = null;
    }
    return ctx ? new CanvasBackend(canvas, ctx) : null;
}

class CanvasBackend implements GraphBackend {
    readonly kind = "canvas2d" as const;
    drawCalls = 0;
    private projected: (Projected | null)[] = [];
    private order: number[] = [];
    private readonly glow = new Map<string, HTMLCanvasElement>();
    private dpr = 1;

    constructor(readonly canvas: HTMLCanvasElement, private readonly ctx: CanvasRenderingContext2D) {}

    resize(width: number, height: number, dpr: number): void {
        this.dpr = dpr;
        const w = Math.max(1, Math.round(width * dpr));
        const h = Math.max(1, Math.round(height * dpr));
        if (this.canvas.width !== w) this.canvas.width = w;
        if (this.canvas.height !== h) this.canvas.height = h;
    }

    /** A soft halo per colour, painted once and stamped — never a gradient per note per frame. */
    private sprite(c: Rgba, dark: boolean): HTMLCanvasElement {
        const key = `${cssRgb(c, 1)}|${dark ? 1 : 0}`;
        let sprite = this.glow.get(key);
        if (sprite) return sprite;
        sprite = createEl("canvas");
        sprite.width = sprite.height = 64;
        const x = sprite.getContext("2d");
        if (x) {
            const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
            g.addColorStop(0, cssRgb(c, dark ? 0.85 : 0.5));
            g.addColorStop(0.3, cssRgb(c, dark ? 0.3 : 0.16));
            g.addColorStop(1, cssRgb(c, 0));
            x.fillStyle = g;
            x.fillRect(0, 0, 64, 64);
        }
        this.glow.set(key, sprite);
        return sprite;
    }

    render(frame: FrameInput): void {
        const { ctx } = this;
        const { width: W, height: H, theme, camera, matrix, n, positions, paint, edgeIndex } = frame;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = cssRgb(theme.bg, 1);
        ctx.fillRect(0, 0, W, H);

        // Nebulae.
        ctx.globalCompositeOperation = theme.dark ? "lighter" : "source-over";
        const neb = frame.nebulae;
        for (let c = 0; c < neb.count; c++) {
            const p = projectPoint(matrix, camera, neb.centre[c * 3], neb.centre[c * 3 + 1], neb.centre[c * 3 + 2], W, H);
            const r = p ? neb.radius[c] * p.scale : 0;
            const a = neb.color[c * 4 + 3];
            if (!p || !(r > 0.5) || a <= 0.002) continue;
            const colour: Rgba = [neb.color[c * 4], neb.color[c * 4 + 1], neb.color[c * 4 + 2], 1];
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
            g.addColorStop(0, cssRgb(colour, a));
            g.addColorStop(0.55, cssRgb(colour, a * 0.35));
            g.addColorStop(1, cssRgb(colour, 0));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalCompositeOperation = "source-over";

        // Project every note once.
        if (this.projected.length !== n) this.projected = Array.from({ length: n }, () => null);
        for (let i = 0; i < n; i++) {
            this.projected[i] =
                paint.nodeColor[i * 4 + 3] < 0.004
                    ? null
                    : projectPoint(matrix, camera, positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2], W, H);
        }

        // Links.
        ctx.lineCap = "round";
        const edgeCount = edgeIndex.length / 2;
        for (let e = 0; e < edgeCount; e++) {
            const alpha = paint.edgeColor[e * 4 + 3];
            const width = paint.edgeWidth[e];
            if (alpha < 0.004 || width <= 0) continue;
            const A = this.projected[edgeIndex[e * 2]];
            const B = this.projected[edgeIndex[e * 2 + 1]];
            if (!A || !B) continue;
            const flags = paint.edgeFlags[e];
            const colour: Rgba = [paint.edgeColor[e * 4], paint.edgeColor[e * 4 + 1], paint.edgeColor[e * 4 + 2], 1];
            ctx.strokeStyle = cssRgb(colour, alpha);
            ctx.lineWidth = width;
            ctx.setLineDash(flags & EDGE_DASHED ? [4.5, 4.5] : []);
            ctx.beginPath();
            ctx.moveTo(A.x, A.y);
            ctx.lineTo(B.x, B.y);
            ctx.stroke();
            if (flags & EDGE_TRAVEL) {
                const u = (frame.time / 2600 + e * 0.137) % 1;
                ctx.drawImage(this.sprite(theme.text, theme.dark), A.x + (B.x - A.x) * u - 7, A.y + (B.y - A.y) * u - 7, 14, 14);
            }
        }
        ctx.setLineDash([]);

        // Notes, back to front: halos, then discs.
        this.order.length = 0;
        for (let i = 0; i < n; i++) if (this.projected[i]) this.order.push(i);
        if (!camera.flat) this.order.sort((a, b) => (this.projected[b] as Projected).depth - (this.projected[a] as Projected).depth);
        const radius = (i: number, p: Projected) =>
            paint.nodeSize[i] * (camera.flat ? clamp(p.scale * 1.05, 0.55, 1.5) : clamp(p.scale * 1.15, 0.45, 1.7));
        ctx.globalCompositeOperation = theme.dark ? "lighter" : "source-over";
        for (const i of this.order) {
            const glow = paint.nodeGlow[i];
            if (glow <= 0) continue;
            const p = this.projected[i] as Projected;
            const s = radius(i, p) * (1 + 3.6 * glow);
            const colour: Rgba = [paint.nodeColor[i * 4], paint.nodeColor[i * 4 + 1], paint.nodeColor[i * 4 + 2], 1];
            ctx.globalAlpha = paint.nodeColor[i * 4 + 3] * (theme.dark ? 0.55 : 0.4) * Math.min(1, glow);
            ctx.drawImage(this.sprite(colour, theme.dark), p.x - s, p.y - s, s * 2, s * 2);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        for (const i of this.order) {
            const p = this.projected[i] as Projected;
            const colour: Rgba = [paint.nodeColor[i * 4], paint.nodeColor[i * 4 + 1], paint.nodeColor[i * 4 + 2], 1];
            ctx.fillStyle = cssRgb(colour, paint.nodeColor[i * 4 + 3]);
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(0.8, radius(i, p)), 0, Math.PI * 2);
            ctx.fill();
        }
        this.drawCalls = 1;
    }

    dispose(): void {
        this.glow.clear();
    }
}

function clamp(v: number, min: number, max: number): number {
    return v < min ? min : v > max ? max : v;
}
