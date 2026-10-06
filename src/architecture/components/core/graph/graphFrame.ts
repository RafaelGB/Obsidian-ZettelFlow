import type { Camera } from "./graphCamera";
import type { GraphTheme } from "./graphTheme";
import type { PaintBuffers } from "./graphPaint";

/**
 * One frame, as the backends read it (#693). Everything is a reference to arrays the view already
 * owns; the `*Version` counters tell a backend what changed, so the GPU is handed new positions only
 * while the layout moves and new colours only when the paint does — never both on every frame.
 */
export interface FrameInput {
    /** CSS pixels of the view. */
    width: number;
    height: number;
    dpr: number;
    camera: Camera;
    /** `viewProjection(camera, width, height)`. */
    matrix: Float32Array;
    theme: GraphTheme;
    n: number;
    positions: Float32Array;
    positionsVersion: number;
    paint: PaintBuffers;
    paintVersion: number;
    /** Links then ghosts, two scene indices each. */
    edgeIndex: Uint32Array;
    edgeVersion: number;
    /** Nebulae (#697): one per community — centre, radius in world units, colour. */
    nebulae: { centre: Float32Array; radius: Float32Array; color: Float32Array; count: number; version: number };
    /** A dark sky shows its stars. */
    stars: boolean;
    /** Milliseconds, for light travelling along a bridge. */
    time: number;
}

/** What draws a frame: WebGL2 when the device has it, a 2D canvas when it does not (#693). */
export interface GraphBackend {
    readonly kind: "webgl2" | "canvas2d";
    readonly canvas: HTMLCanvasElement;
    resize(width: number, height: number, dpr: number): void;
    render(frame: FrameInput): void;
    /** How many draw calls the last frame took — the number the epic promised would be 3–5. */
    readonly drawCalls: number;
    dispose(): void;
}
