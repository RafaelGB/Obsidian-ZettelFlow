import { describe, it, expect } from "@jest/globals";
import {
    environmentEnabled,
    starfieldPositions,
    haloSpec,
} from "architecture/components/core/graph3d/graph3dEnvironment";

/**
 * A1 (#384) — the immersive "Knowledge Galaxy" environment. The renderer body is WebGL/GPU and
 * manual-verify, so every testable decision lives in this pure helper: the gate, the starfield
 * geometry, and the halo spec.
 */
describe("graph3dEnvironment — immersive Knowledge Galaxy (A1, #384)", () => {
    describe("environmentEnabled (the FR4 gate)", () => {
        const on = { reduced: false, lite: false, webgl: true, mobile: false };
        it("is enabled only when not reduced, not lite, WebGL present and not mobile", () => {
            expect(environmentEnabled(on)).toBe(true);
        });
        it("is disabled under prefers-reduced-motion", () => {
            expect(environmentEnabled({ ...on, reduced: true })).toBe(false);
        });
        it("is disabled in lite mode (the FPS escape hatch)", () => {
            expect(environmentEnabled({ ...on, lite: true })).toBe(false);
        });
        it("is disabled without WebGL", () => {
            expect(environmentEnabled({ ...on, webgl: false })).toBe(false);
        });
        it("is disabled on mobile (the navigable-list fallback is used instead)", () => {
            expect(environmentEnabled({ ...on, mobile: true })).toBe(false);
        });
    });

    describe("starfieldPositions", () => {
        it("returns count*3 flat coordinates", () => {
            expect(starfieldPositions(100, 200, 400, Math.random).length).toBe(300);
        });
        it("places every star on a shell within [inner, outer] (depth-cued, not a cube)", () => {
            const inner = 200, outer = 400;
            const pts = starfieldPositions(500, inner, outer, Math.random);
            for (let i = 0; i < pts.length; i += 3) {
                const r = Math.hypot(pts[i], pts[i + 1], pts[i + 2]);
                expect(r).toBeGreaterThanOrEqual(inner - 1e-3);
                expect(r).toBeLessThanOrEqual(outer + 1e-3);
            }
        });
        it("is deterministic for a seeded rng (pure, no hidden state)", () => {
            const seeded = () => 0.42;
            const a = starfieldPositions(10, 100, 200, seeded);
            const b = starfieldPositions(10, 100, 200, seeded);
            expect(Array.from(a)).toEqual(Array.from(b));
        });
        it("returns an empty array for a non-positive count", () => {
            expect(starfieldPositions(0, 100, 200, Math.random).length).toBe(0);
        });
    });

    describe("haloSpec", () => {
        it("gives a hub a larger halo than a non-hub of equal degree, but both glow", () => {
            const hub = haloSpec(9, true);
            const plain = haloSpec(9, false);
            expect(hub).not.toBeNull();
            expect(plain).not.toBeNull();
            expect(hub!.scale).toBeGreaterThan(plain!.scale);
        });
        it("keeps opacity within (0, 1]", () => {
            for (const spec of [haloSpec(9, true), haloSpec(9, false)]) {
                expect(spec!.opacity).toBeGreaterThan(0);
                expect(spec!.opacity).toBeLessThanOrEqual(1);
            }
        });
        it("grows the halo monotonically with degree", () => {
            expect(haloSpec(16, true)!.scale).toBeGreaterThan(haloSpec(4, true)!.scale);
        });
        it("returns null for a low-degree non-hub (halos concentrate on meaningful nodes)", () => {
            expect(haloSpec(1, false)).toBeNull();
        });
    });
});
