// Pure, Obsidian-free math + gating for the immersive "Knowledge Galaxy" environment (A1, #384).
// Kept out of Graph3DRenderer so the geometry and the gate are unit-testable without a WebGL/DOM
// mock — the same pure/shell split the codebase already uses between `knowledge/map/graph3d.ts`
// (pure) and the renderer (WebGL shell).

/** The inputs that decide whether the immersive environment (starfield + halos + bloom) should run. */
export interface EnvironmentGate {
    /** The OS "reduce motion" preference is on. */
    reduced: boolean;
    /** The renderer's Lite mode (per-frame effects dropped for maximum FPS). */
    lite: boolean;
    /** WebGL is available. */
    webgl: boolean;
    /** Running on mobile (which uses the navigable-list fallback, not the WebGL graph). */
    mobile: boolean;
}

/**
 * The environment is purely additive eye-candy, so it only runs when it is both wanted and cheap:
 * never under reduced-motion, never in Lite, only with WebGL, and never on mobile. Lite stays the
 * guaranteed performance escape hatch (#384 AC).
 */
export function environmentEnabled(gate: EnvironmentGate): boolean {
    return !gate.reduced && !gate.lite && gate.webgl && !gate.mobile;
}

/**
 * `count` star positions scattered on a spherical shell with radius in `[inner, outer]`, as a flat
 * `[x,y,z, …]` `Float32Array` ready for a `THREE.BufferAttribute`. A shell (not a cube) reads as
 * depth-cued space wrapping the graph. Pure: all randomness comes from the injected `rng`
 * (`() => number` in `[0,1)`), so a seeded rng makes the field deterministic and testable.
 */
export function starfieldPositions(count: number, inner: number, outer: number, rng: () => number): Float32Array {
    const n = Math.max(0, Math.floor(count));
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        // A uniform direction on the unit sphere, then a radius within the shell.
        const theta = 2 * Math.PI * rng();
        const cosPhi = 2 * rng() - 1;
        const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
        const radius = inner + (outer - inner) * rng();
        const o = i * 3;
        positions[o] = radius * sinPhi * Math.cos(theta);
        positions[o + 1] = radius * sinPhi * Math.sin(theta);
        positions[o + 2] = radius * cosPhi;
    }
    return positions;
}

/** The halo sprite spec (relative scale + opacity) for a node, or `null` when it earns no halo. */
export interface HaloSpec {
    scale: number;
    opacity: number;
}

/** Below this degree a non-hub node gets no halo — halos concentrate on meaningful nodes (FPS, #384). */
export const HALO_MIN_DEGREE = 2;

/**
 * Halo geometry for a node given its degree (`val`) and whether it is a hub. Extends the glow beyond
 * hubs-only (FR2) while keeping hubs visually dominant (bigger, brighter). A non-hub node below
 * {@link HALO_MIN_DEGREE} returns `null` so large graphs never pay a draw call per trivial node.
 */
export function haloSpec(val: number, isHub: boolean): HaloSpec | null {
    if (!isHub && val < HALO_MIN_DEGREE) return null;
    const degree = Math.sqrt(Math.max(1, val));
    const scale = isHub ? degree * 7 + 16 : degree * 4 + 8;
    const opacity = isHub ? 0.5 : 0.28;
    return { scale, opacity };
}
