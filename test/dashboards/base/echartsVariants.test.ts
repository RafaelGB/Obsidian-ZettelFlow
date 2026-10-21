import { describe, it, expect } from "@jest/globals";
import { execFileSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

/**
 * **Only the variants the panels use** (#834): the legend registered plain and the visual map
 * continuous. jest maps `echarts` to a mock, so the real library draws every panel type's real option
 * out of process (`test/support/echartsReal.mjs`, server-side to SVG), with the plugin's own
 * registration — and ECharts must say nothing about a component used but not registered.
 */

const ROOT = join(__dirname, "..", "..", "..");
const HAS_ECHARTS = existsSync(join(ROOT, "node_modules", "echarts", "core.js"));

type Drawn = Record<string, { svg: number; warnings: string[]; legend: boolean; visualMap: boolean; error: string | null }>;

function drawAll(): Drawn {
    const out = execFileSync(process.execPath, [join(ROOT, "test", "support", "echartsReal.mjs")], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    const line = out.split("\n").find((each) => each.startsWith("@@zf "));
    if (!line) throw new Error(`no answer from echartsReal: ${out.slice(0, 400)}`);
    return JSON.parse(line.slice(5)) as Drawn;
}

(HAS_ECHARTS ? describe : describe.skip)("ECharts draws every panel type with the variants registered (#834)", () => {
    const drawn = HAS_ECHARTS ? drawAll() : ({} as Drawn);

    it("draws all five chart panels", () => {
        expect(Object.keys(drawn).sort()).toEqual(["bar", "heatmap", "line", "pie", "scatter"]);
        // A variant missing breaks the drawing itself (walked: the heatmap, without the continuous map).
        expect(Object.entries(drawn).filter(([, panel]) => panel.error).map(([type, panel]) => `${type}: ${panel.error}`)).toEqual([]);
        for (const panel of Object.values(drawn)) expect(panel.svg).toBeGreaterThan(200);
    });

    it("uses a legend on bar, line and pie and a visual map on heatmap and scatter — and none is missing", () => {
        expect(["bar", "line", "pie"].every((type) => drawn[type].legend)).toBe(true);
        expect(["heatmap", "scatter"].every((type) => drawn[type].visualMap)).toBe(true);
        const missing = Object.values(drawn).flatMap((panel) => panel.warnings.filter((said) => /not imported|use\(\w*(Legend|VisualMap)/i.test(said)));
        expect(missing).toEqual([]);
    });

    it("says nothing at all — the grid contains its labels the ECharts 6 way (#858)", () => {
        expect(Object.values(drawn).flatMap((panel) => panel.warnings)).toEqual([]);
    });
});
