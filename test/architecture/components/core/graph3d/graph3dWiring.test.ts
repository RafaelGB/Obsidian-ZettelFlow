import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

const SRC = join(__dirname, "..", "..", "..", "..", "..", "src", "architecture", "components", "core");
const readCore = (rel: string) => readFileSync(join(SRC, rel), "utf8");

/**
 * #280 S1 — structural guardrails for the 3D graph mode: it's wired into the Graph surface, the heavy
 * WebGL library is loaded lazily (never statically at plugin load), and the renderer is read-only
 * (navigates via openLinkText, never writes).
 */
describe("Graph 3D mode wiring (#280 S1)", () => {
    it("GraphSurfaceView builds the Graph3DRenderer (the surface is 3D-only)", () => {
        const src = readCore("surface/GraphSurfaceView.ts");
        expect(src).toMatch(/new\s+Graph3DRenderer\(/);
    });

    it("Graph3DRenderer reads the model via the State surface and navigates read-only", () => {
        const src = readCore("graph3d/Graph3DRenderer.ts");
        expect(src).toMatch(/build3DGraph[\s\S]*from\s+["']architecture\/knowledge\/state["']/);
        expect(src).toMatch(/openLinkText\(/);
        // Read-only: never executes an action or writes frontmatter from the view.
        expect(src).not.toMatch(/\.execute\(/);
        expect(src).not.toMatch(/addFrontMatter|processFrontMatter/);
    });

    it("loads 3d-force-graph lazily (dynamic import), not as a static value import", () => {
        const src = readCore("graph3d/Graph3DRenderer.ts");
        expect(src).toMatch(/import\(\s*["']3d-force-graph["']\s*\)/); // lazy runtime import
        // The only static reference is a type-only import (erased at build) — no eager value import.
        expect(src).not.toMatch(/^import\s+ForceGraph3D\s+from\s+["']3d-force-graph["']/m);
        expect(src).not.toMatch(/^import\s+\{[^}]*\}\s+from\s+["']3d-force-graph["']/m); // (value) named import
    });
});

/**
 * A1 (#384) — the immersive "Knowledge Galaxy" environment is additive, gated, and best-effort: it is
 * built behind `environmentEnabled()`, bloom loads lazily, and a bloom failure never blanks the graph.
 */
describe("Graph 3D immersive environment (A1, #384)", () => {
    const src = readCore("graph3d/Graph3DRenderer.ts");

    it("gates the environment behind environmentEnabled()", () => {
        expect(src).toMatch(/environmentEnabled\(/);
    });

    it("loads selective bloom lazily (dynamic import), never as a static import", () => {
        expect(src).toMatch(/import\(\s*["'][^"']*UnrealBloomPass[^"']*["']\s*\)/);
        expect(src).not.toMatch(/^import\s+.*UnrealBloomPass/m);
    });

    it("makes selective bloom best-effort — a failed bloom load is caught and logged, not thrown", () => {
        expect(src).toMatch(/import\([^)]*UnrealBloomPass[^)]*\)/); // the lazy load
        expect(src).toMatch(/selective bloom unavailable/); // the catch-block log.warn — proves it degrades
    });

    it("keeps the base render path independent of the environment (applyGraphData before env)", () => {
        // applyGraphData()/applySize() drive the visible graph and run before buildEnvironment()/applyBloom(),
        // so a starfield/bloom failure can never blank the nodes and links.
        expect(src).toMatch(/this\.applyGraphData\(\);\s*this\.applySize\(\);/);
        expect(src).toMatch(/this\.applyGraphData\(\);[\s\S]*this\.buildEnvironment\(\);/);
    });

    it("disposes the starfield on teardown (no GPU leak)", () => {
        expect(src).toMatch(/disposeStarfield\(\)/);
    });
});
