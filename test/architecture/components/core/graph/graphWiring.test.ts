import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const GRAPH = "src/architecture/components/core/graph";
const code = (source: string) =>
    source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");

/**
 * **The graph's wiring** (#693, epic #692) — the structural promises a headless runner can check.
 * The frame rate cannot be measured without a screen; what it costs to *ship* can.
 */
describe("the graph engine replaced a megabyte (#693)", () => {
    it("ships without three.js, 3d-force-graph or three-spritetext", () => {
        const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
        for (const dep of ["three", "3d-force-graph", "three-spritetext"]) expect(Object.keys(pkg.dependencies)).not.toContain(dep);
    });

    it("imports none of them anywhere in the plugin", () => {
        const offenders: string[] = [];
        const walk = (dir: string) => {
            for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
                const rel = `${dir}/${entry.name}`;
                if (entry.isDirectory()) walk(rel);
                else if (/\.tsx?$/.test(entry.name) && /from ["'](three|3d-force-graph|three-spritetext)["'/]|import\(["'](three|3d-force-graph)/.test(read(rel)))
                    offenders.push(rel);
            }
        };
        walk("src");
        expect(offenders).toEqual([]);
    });

    it("no longer needs the WebGPU stub that kept three's dead code out", () => {
        expect(read("esbuild.config.mjs")).not.toContain("three/webgpu");
    });
});

describe("Explore draws the graph through the new engine (#484, #693)", () => {
    it("mounts the graph lens", () => {
        expect(read("src/architecture/components/core/askGraph/AskGraphRenderer.ts")).toMatch(/new\s+GraphLens\(/);
    });

    it("reads the model through the State surface", () => {
        expect(read(`${GRAPH}/GraphLens.ts`)).toMatch(/build3DGraph[\s\S]*from\s+["']architecture\/knowledge\/state["']/);
    });

    it("navigates and never writes", () => {
        const lens = code(read(`${GRAPH}/GraphLens.ts`));
        expect(lens).toContain("openLinkText(");
        expect(lens).not.toMatch(/FileService|FrontmatterService|processFrontMatter|\.execute\(/);
    });

    it("follows the theme when it changes (§XV)", () => {
        expect(read(`${GRAPH}/GraphLens.ts`)).toMatch(/on\("css-change"[\s\S]{0,80}refreshTheme\(\)/);
    });
});

describe("it draws on demand, and degrades instead of going blank (#693)", () => {
    const canvas = code(read(`${GRAPH}/GraphCanvas.ts`));

    it("asks for a frame only when one is pending-free and the view is visible", () => {
        expect(canvas).toContain("if (this.frameRequest !== null || !this.visible || !this.backend) return;");
    });

    it("stops asking while the view is hidden (#302 S4)", () => {
        expect(canvas).toContain("IntersectionObserver");
    });

    it("falls back from WebGL2 to a 2D canvas, and from no canvas to a list", () => {
        expect(canvas).toContain("this.backend = createGlBackend(this.glCanvas);");
        // …on a fresh canvas, because one that was asked for WebGL2 will never give a 2D context.
        expect(canvas).toContain("this.backend = createCanvasBackend(fresh);");
        expect(read(`${GRAPH}/GraphLens.ts`)).toContain("renderFallback(");
    });

    it("gives the WebGL context back when it goes", () => {
        expect(read(`${GRAPH}/glBackend.ts`)).toContain('getExtension("WEBGL_lose_context")?.loseContext()');
        expect(canvas).toContain("this.backend?.dispose()");
    });

    it("keeps its draw calls fixed, whatever the size of the vault", () => {
        // One instanced call per pass: nebulae, stars, links, halos, notes.
        const gl = code(read(`${GRAPH}/glBackend.ts`));
        expect((gl.match(/drawArraysInstanced\(/g) ?? []).length).toBe(4);
        expect((gl.match(/drawArrays\(/g) ?? []).length).toBe(1);
    });
});

describe("the layout runs off the main thread, and is remembered (#694)", () => {
    const runner = code(read(`${GRAPH}/layoutRunner.ts`));

    it("starts a worker from the bundled source, the way Obsidian starts its own", () => {
        expect(runner).toContain('import workerSource from "./layout.worker?worker"');
        expect(runner).toContain('URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }))');
    });

    it("bundles the worker inline, because Obsidian loads one main.js", () => {
        expect(read("esbuild.config.mjs")).toContain("inline-worker");
    });

    it("falls back to slices on the main thread rather than stalling or failing", () => {
        expect(runner).toContain("this.runLocal(");
        expect(runner).toContain("MAIN_THREAD_SLICE_MS");
    });

    it("lets the worker go when the view does", () => {
        expect(runner).toContain("this.worker?.terminate()");
        expect(runner).toContain("URL.revokeObjectURL(this.workerUrl)");
    });

    it("reopens on the layout it remembered, and remembers what settled", () => {
        const lens = code(read(`${GRAPH}/GraphLens.ts`));
        expect(lens).toContain("recallLayout(this.layoutKey)");
        expect(lens).toContain("warmStart(this.scene)");
        expect(lens).toContain("rememberLayout(this.layoutKey, scene, canvas.layoutPositions)");
    });
});

describe("share and tour, carried over (#385, #386)", () => {
    const lens = code(read(`${GRAPH}/GraphLens.ts`));

    it("frames everything before it captures", () => {
        const body = lens.slice(lens.indexOf("private async exportImage"));
        expect(body.indexOf("frameAll(true)")).toBeGreaterThan(-1);
        expect(body.indexOf("frameAll(true)")).toBeLessThan(body.indexOf("capture()"));
    });

    it("captures in the same task as the render, so the WebGL buffer is still there", () => {
        const capture = code(read(`${GRAPH}/GraphCanvas.ts`));
        const body = capture.slice(capture.indexOf("async capture()"));
        expect(body.indexOf("this.renderNow(")).toBeLessThan(body.indexOf("drawImage(this.glCanvas"));
    });

    it("saves through the vault facade, and the share modal builds no innerHTML", () => {
        expect(read("src/architecture/components/core/export/saveExport.ts")).toMatch(/FileService/);
        expect(read("src/architecture/components/core/export/ExportShareModal.ts")).not.toContain("innerHTML");
    });

    it("derives the tour from the pure tourStops", () => {
        expect(lens).toContain("tourStops(this.data)");
    });

    it("opens its options where the control is, so a keyboard can reach them (#577)", () => {
        expect(lens).toContain("menu.showAtPosition(");
        expect(lens).toContain('"aria-haspopup": "menu"');
    });
});
