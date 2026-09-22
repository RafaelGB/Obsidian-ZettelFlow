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
        expect(CODE).toMatch(/setInterval\(\(\) => this\.rebuildHulls\(\)/);
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
