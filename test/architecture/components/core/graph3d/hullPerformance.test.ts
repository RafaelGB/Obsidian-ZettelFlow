import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const RENDERER = read("src/architecture/components/core/graph3d/Graph3DRenderer.ts");

/**
 * **The region spheres arrive in a quarter of a second, not nine** (#520).
 *
 * The delay was never the cost of drawing them. `rebuildHulls()` had one regular caller —
 * `onEngineStop`, which fires when `cooldownTime` expires at **9000 ms**. The spheres waited for
 * the whole force simulation to cool down.
 *
 * Calling it more often was only unattractive because each call disposed and reallocated a
 * `SphereGeometry` and a `MeshBasicMaterial` per region, and rasterised a fresh `SpriteText`
 * canvas per label. Make an update cheap and it can happen continuously, so the hulls grow with
 * the layout instead of appearing after it.
 */

function code(source: string): string {
    return source
        .split("\n")
        .filter((line) => {
            const trimmed = line.trim();
            return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
        })
        .join("\n");
}

const CODE = code(RENDERER);

describe("they do not wait for the layout to stop (#520)", () => {
    it("is driven by a timer as well as by the settle", () => {
        // The tick drives **both** scene objects since #532 -- the hulls and the ghost edges answer
        // the same question, *where are the notes right now?*, so they share one interval rather
        // than racing on two.
        expect(CODE).toMatch(/setInterval\(\(\) => this\.refreshSceneObjects\(\)/);
        const tick = CODE.slice(CODE.indexOf("private refreshSceneObjects"));
        expect(tick.slice(0, 200)).toContain("this.rebuildHulls();");
        expect(tick.slice(0, 200)).toContain("this.rebuildGhosts();");
        expect(CODE).toContain("this.rebuildHulls(); // cluster bubbles need settled positions");
    });

    it("pauses and resumes with the view, like the proximity labels", () => {
        // An interval that keeps ticking in a hidden split is the bug #302 S4 already fixed once.
        const active = CODE.slice(CODE.indexOf("private setActive"));
        const body = active.slice(0, active.indexOf("private "  + "onEngineSettled") + 1 || 1200);
        expect(body.slice(0, 1200)).toContain("hullTimer");
    });

    it("is cleared when the graph goes away", () => {
        const teardown = CODE.slice(CODE.indexOf("private teardownGraph"));
        expect(teardown.slice(0, 1400)).toContain("clearInterval(this.hullTimer)");
    });
});

describe("an update allocates nothing it can reuse (#520)", () => {
    it("shares one unit sphere and scales it", () => {
        // Twelve geometries per rebuild, thrown away and rebuilt, is what made rebuilding
        // expensive enough to defer.
        expect((CODE.match(/new three\.SphereGeometry\(/g) ?? [])).toHaveLength(1);
        expect(CODE).toContain("new three.SphereGeometry(1,");
        expect(CODE).toContain("scale.setScalar(");
    });

    it("keeps a mesh per region and only builds on a miss", () => {
        const hulls = CODE.slice(CODE.indexOf("private rebuildHulls"));
        const body = hulls.slice(0, hulls.indexOf("private disposeHulls"));
        expect(body).toContain("this.hulls.get(group)");
        expect(body).toMatch(/if \(!mesh\)/);
    });

    it("rebuilds a label only when its name changed", () => {
        // Every SpriteText rasterises a canvas texture. Repositioning one costs nothing;
        // recreating it every 250 ms would cost more than the nine-second wait did.
        const hulls = CODE.slice(CODE.indexOf("private rebuildHulls"));
        const body = hulls.slice(0, hulls.indexOf("private disposeHulls"));
        expect(body).toContain("this.regionLabels.get(group)");
        expect(body).toContain("labelNames");
    });

    it("frees the shared geometry when the hulls go", () => {
        const dispose = CODE.slice(CODE.indexOf("private disposeHulls"));
        expect(dispose.slice(0, 900)).toContain("this.hullGeometry");
    });
});

describe("nothing was given up for it (#520)", () => {
    it("keeps the floor, the colour and the opacity", () => {
        const hulls = CODE.slice(CODE.indexOf("private rebuildHulls"));
        const body = hulls.slice(0, hulls.indexOf("private disposeHulls"));
        expect(body).toContain("HULL_MIN_NODES");
        expect(body).toContain("communityColor(group)");
        expect(body).toContain("0.06");
    });

    it("still builds nothing in lite mode", () => {
        expect(CODE).toMatch(/private rebuildHulls\(\): void \{[\s\S]{0,200}this\.lite/);
    });
});

/**
 * The ghost edges copy this lifecycle exactly (#532, epic #529) -- one shared material, a line per
 * pair kept across ticks, and anything no longer wanted removed and disposed. They are held to the
 * same rules because they are the same kind of thing: a scene object that follows the layout.
 */
describe("a ghost edge lives like a hull (#532, FR-3, FR-8, AC-8)", () => {
    const ghosts = CODE.slice(CODE.indexOf("private rebuildGhosts"), CODE.indexOf("private dropHull"));

    it("shares one material and keeps a line per pair", () => {
        expect(ghosts).toContain("if (!this.ghostMaterial)");
        expect(ghosts).toContain("let line = this.ghostLines.get(key)");
        expect(ghosts).toContain("if (!line)");
        // On a hit it repositions rather than rebuilding: the six floats go straight into the
        // buffer that is already on the GPU.
        expect(ghosts).toContain("position.needsUpdate = true");
        expect(ghosts).toContain("line.computeLineDistances()");
    });

    it("drops what is no longer wanted, and disposes the geometry it owned", () => {
        expect(ghosts).toContain("if (!keep.has(key)) this.dropGhost(scene, key)");
        const drop = CODE.slice(CODE.indexOf("private dropGhost"), CODE.indexOf("private disposeGhosts"));
        expect(drop).toContain("scene.remove(line)");
        expect(drop).toContain("line.geometry.dispose()");
        const dispose = CODE.slice(CODE.indexOf("private disposeGhosts"), CODE.indexOf("private dropHull"));
        expect(dispose).toContain("this.ghostMaterial?.dispose()");
    });

    it("recomputes what it wants from the active lens, so clearing it self-heals", () => {
        // No hook of its own: a background click drops the lens, and the next tick removes the
        // lines because they are no longer in the wanted set.
        expect(ghosts).toContain('const wanted = this.overlay === "gaps" ? this.ghosts : []');
    });

    it("returns before touching the scene when there is no three, and says so once", () => {
        expect(ghosts.slice(0, 220)).toContain("if (!three || !this.graph || this.lite) return;");
        expect(CODE).toContain('log.warn("[Graph3D] ghost edges unavailable (three)');
        expect(CODE).not.toContain("console.warn");
        // Once per activation, not once per tick.
        expect(CODE).toContain("this.ghostWarned = true");
    });

    it("goes away with the hulls, in lite mode and at teardown", () => {
        const lite = CODE.slice(CODE.indexOf("private toggleLite"));
        expect(lite.slice(0, 900)).toContain("this.disposeGhosts(this.graph.scene())");
    });

    it("never writes a link, a node position or the graph data", () => {
        // It *reads* `graphData()` for the live positions, exactly as `rebuildHulls` does. What it
        // must never do is call it **with an argument**, which is the write -- a ghost edge in the
        // link array would reach d3-force and pull the two notes together.
        expect(ghosts).not.toMatch(/graphData\(\s*[^)\s]/);
        const writes = CODE.match(/\.graphData\(\s*[^)\s]/g) ?? [];
        expect(writes).toHaveLength(1);
        expect(ghosts).not.toContain("displayed.links");
        expect(ghosts).not.toContain(".push(");
        expect(ghosts).not.toMatch(/node\.(x|y|z)\s*=/);
    });
});
