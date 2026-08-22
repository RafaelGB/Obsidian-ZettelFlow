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
    it("GraphSurfaceView maps the 3d mode to Graph3DRenderer", () => {
        const src = readCore("surface/GraphSurfaceView.ts");
        expect(src).toMatch(/case\s+"3d":/);
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
