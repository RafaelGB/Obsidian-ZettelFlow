// The real ECharts, out of jest's process (#834): jest maps `echarts` to a mock (the library is ES
// modules only), so a suite runs this with `node`. It bundles the plugin's own ECharts registration and
// the five chart panels' option builders with esbuild, draws each panel type server-side to SVG, and
// prints one line: `@@zf {"bar": {"svg": <length>, "warnings": [...]}, ...}`.
//
//   node test/support/echartsReal.mjs
import { build } from "esbuild";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (path) => JSON.stringify(join(ROOT, "src", path).replace(/\\/g, "/"));

const entry = `
import { init, use } from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import ${src("dashboards/base/echartsRuntime.ts")};
import { buildBarOption } from ${src("dashboards/panels/bar/barOption.ts")};
import { buildLineOption } from ${src("dashboards/panels/line/lineOption.ts")};
import { buildPieOption } from ${src("dashboards/panels/pie/pieOption.ts")};
import { buildHeatmapMatrixOption } from ${src("dashboards/panels/heatmap/heatmapOption.ts")};
import { buildScatterOption } from ${src("dashboards/panels/scatter/scatterOption.ts")};
import { buildChartTheme } from ${src("dashboards/panels/theme.ts")};
import { normalize } from ${src("dashboards/datastore/index.ts")};
export { init, use, SVGRenderer, buildBarOption, buildLineOption, buildPieOption, buildHeatmapMatrixOption, buildScatterOption, buildChartTheme, normalize };
`;

const dir = mkdtempSync(join(tmpdir(), "zf-echarts-"));
const out = join(dir, "bundle.mjs");
try {
    await build({
        stdin: { contents: entry, resolveDir: ROOT, loader: "ts" },
        bundle: true,
        platform: "node",
        format: "esm",
        outfile: out,
        tsconfig: join(ROOT, "tsconfig.json"),
        external: ["obsidian"],
        logLevel: "silent",
    });
    // ECharts binds console as it loads: what it says is listened to from before then.
    const said = [];
    const warn = console.warn;
    const error = console.error;
    const log = console.log;
    const listen = (...args) => said.push(args.map(String).join(" "));
    console.warn = listen;
    console.error = listen;
    console.log = listen;
    const z = await import(pathToFileURL(out).href);
    z.use([z.SVGRenderer]);

    const props = [
        { id: "note.day", name: "Day" },
        { id: "note.mood", name: "Mood" },
        { id: "note.focus", name: "Focus" },
        { id: "note.hours", name: "Hours" },
    ];
    const entryOf = (day, mood, focus, hours) => ({
        path: `${day}.md`,
        cells: {
            "note.day": { kind: "category", display: day, raw: day },
            "note.mood": { kind: "number", display: String(mood), raw: mood },
            "note.focus": { kind: "number", display: String(focus), raw: focus },
            "note.hours": { kind: "number", display: String(hours), raw: hours },
        },
    });
    const snap = z.normalize([entryOf("Mon", 3, 4, 6), entryOf("Tue", 5, 2, 7), entryOf("Wed", 4, 5, 8)], props, "sig");
    const theme = z.buildChartTheme({});
    const config = (type, mapping) => ({ id: "p", type, mapping });
    const options = {
        bar: z.buildBarOption(snap, config("bar", { category: "note.day", series: ["note.mood", "note.focus"] }), theme),
        line: z.buildLineOption(snap, config("line", { category: "note.day", series: ["note.mood", "note.focus"] }), theme, false),
        pie: z.buildPieOption(snap, config("pie", { category: "note.day", value: "note.mood" }), theme, true),
        heatmap: z.buildHeatmapMatrixOption(snap, config("heatmap", { x: "note.day", y: "note.focus", value: "note.mood" }), theme),
        scatter: z.buildScatterOption(snap, config("scatter", { x: "note.mood", y: "note.focus", size: "note.hours", color: "note.hours" }), theme, true),
    };
    const result = {};
    for (const [type, option] of Object.entries(options)) {
        said.length = 0;
        // A component the option needs and the runtime did not register may throw while drawing: said, per panel.
        let svg = "";
        let failed = null;
        // No animation: a chart that failed half-drawn must not keep its loop, and node, running.
        const chart = z.init(null, undefined, { renderer: "svg", ssr: true, width: 400, height: 300 });
        try {
            chart.setOption({ ...option, animation: false });
            svg = chart.renderToSVGString();
        } catch (error) {
            failed = String(error?.message ?? error);
        } finally {
            chart.dispose();
        }
        result[type] = { svg: svg.length, warnings: [...said], legend: Boolean(option.legend), visualMap: Boolean(option.visualMap), error: failed };
    }
    console.warn = warn;
    console.error = error;
    console.log = log;
    console.log(`@@zf ${JSON.stringify(result)}`);
    // Said, and done: nothing ECharts left scheduled keeps the process alive.
    process.exitCode = 0;
    setImmediate(() => process.exit(0));
} finally {
    rmSync(dir, { recursive: true, force: true });
}
