// The motion audit's desktop run (#826, epic #827) — a developer's tool, never in the bundle.
//
// Before running it (docs/development/motion-audit.md):
//   1. Launch a SEPARATE Obsidian, never your own:
//        Obsidian.exe --user-data-dir=<scratch>/obsdata --remote-debugging-port=9333
//      on a throwaway vault with the built plugin, a long technical book at Books/A philosophy of
//      software design.epub and a shelf of 200 books (copies of one real book are enough).
//   2. Close the first-run welcome modal, and turn on Settings › Advanced › Frame meter.
//   3. node scripts/motion-trace.mjs <out.json>
// Then read the frame meter's lines in Settings › Advanced: the frames are the meter's own; this
// script replays each gesture with trusted input over CDP and reads, from a Chrome trace around each,
// only the layouts, style recalculations and paints between the gesture's two marks.
import { writeFileSync } from "fs";

const targets = await (await fetch("http://127.0.0.1:9333/json")).json();
const page = targets.find((t) => t.type === "page" && t.url.startsWith("app://"));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
let traceEvents = [];
let traceDone = null;
ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.method === "Tracing.dataCollected") traceEvents.push(...msg.params.value);
    if (msg.method === "Tracing.tracingComplete") traceDone?.();
    if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
    }
};
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) =>
    new Promise((resolve) => {
        const n = ++id;
        pending.set(n, resolve);
        ws.send(JSON.stringify({ id: n, method, params }));
    });
const evaluate = async (expression) => {
    const res = await send("Runtime.evaluate", { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true });
    if (res.result?.exceptionDetails) throw new Error(JSON.stringify(res.result.exceptionDetails).slice(0, 400));
    return res.result?.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send("Page.bringToFront");
await send("Emulation.setFocusEmulationEnabled", { enabled: true });

const CATEGORIES = ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.frame", "blink.user_timing", "benchmark", "viz"].join(",");
async function traced(name, run) {
    traceEvents = [];
    await send("Tracing.start", { categories: CATEGORIES, transferMode: "ReportEvents" });
    await sleep(150);
    await evaluate(`performance.mark("zf-start-${name}")`);
    await run();
    await evaluate(`performance.mark("zf-end-${name}")`);
    const done = new Promise((r) => (traceDone = r));
    await send("Tracing.end");
    await done;
    const mark = (label) => traceEvents.find((e) => e.name === label)?.ts;
    const from = mark(`zf-start-${name}`);
    const to = mark(`zf-end-${name}`);
    const inside = traceEvents.filter((e) => from && to && e.ts > from && e.ts < to && e.ph !== "E");
    const count = (n) => inside.filter((e) => e.name === n).length;
    const ms = (n) => Math.round(inside.filter((e) => e.name === n).reduce((sum, e) => sum + (e.dur ?? 0), 0) / 100) / 10;
    // The compositor's own frames: what the screen showed, even while the main thread was busy.
    const reports = traceEvents.filter((e) => e.name === "PipelineReporter" && e.ph === "b" && from && to && e.ts > from && e.ts < to);
    const state = (e) => e.args?.chrome_frame_reporter?.state ?? e.args?.data?.state ?? "";
    const presented = reports.filter((e) => /PRESENTED/.test(state(e)));
    const dropped = reports.filter((e) => /DROPPED/.test(state(e)));
    const shown = presented.map((e) => e.ts).sort((a, b) => a - b);
    const gaps = shown.slice(1).map((ts, i) => (ts - shown[i]) / 1000).sort((a, b) => a - b);
    const states = [...new Set(reports.map(state))];
    return {
        layouts: count("Layout"),
        layoutMs: ms("Layout"),
        styleRecalcs: count("UpdateLayoutTree"),
        styleMs: ms("UpdateLayoutTree"),
        paints: count("Paint"),
        windowMs: from && to ? Math.round((to - from) / 1000) : null,
        compositor: { frames: reports.length, presented: presented.length, dropped: dropped.length, worstGapMs: gaps.length ? Math.round(gaps[gaps.length - 1] * 10) / 10 : null, p95GapMs: gaps.length ? Math.round(gaps[Math.min(gaps.length - 1, Math.ceil(gaps.length * 0.95) - 1)] * 10) / 10 : null, states },
    };
}

// ── trusted input ─────────────────────────────────────────────────────────────
const touch = (type, x, y) => send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }] });
async function swipe(x0, y0, dx, steps = 18, gap = 16) {
    await touch("touchStart", x0, y0);
    for (let i = 1; i <= steps; i++) {
        await touch("touchMove", x0 + (dx * i) / steps, y0);
        await sleep(gap);
    }
    await touch("touchEnd", x0 + dx, y0);
}
async function click(x, y) {
    for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
}
async function key(name) {
    const vk = { ArrowRight: 39, ArrowLeft: 37, Escape: 27 }[name];
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: name, code: name, windowsVirtualKeyCode: vk });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: name, code: name, windowsVirtualKeyCode: vk });
}

const out = { runs: [] };
const record = async (gesture, run) => out.runs.push({ gesture, ...(await traced(gesture.replace(/\W+/g, "-"), run)) });

// ── the Reader in Page, on the long technical chapter ─────────────────────────
const openReader = async (book, chapter, motion = "leaf") =>
    evaluate(`
        for (const leaf of app.workspace.getLeavesOfType("zettelflow-reader")) leaf.detach();
        const plugin = app.plugins.plugins.zettelflow;
        plugin.settings.readerPrefs = { ...(plugin.settings.readerPrefs ?? {}), layout: "page", size: "medium" };
        plugin.settings.readingMotion = { ...(plugin.settings.readingMotion ?? {}), chapter: "${motion}", opening: "shot" };
        const leaf = app.workspace.getLeaf(true);
        await leaf.setViewState({ type: "zettelflow-reader", state: { source: ${JSON.stringify(book)}, chapter: ${chapter} }, active: true });
        app.workspace.setActiveLeaf(leaf, { focus: true });
        for (let i = 0; i < 300 && !leaf.view.containerEl.querySelector(".zettelkasten-flow__reader-next"); i++) await new Promise((r) => setTimeout(r, 30));
        await new Promise((r) => setTimeout(r, 600));
        const s = leaf.view.containerEl.querySelector(".zettelkasten-flow__reader-stage").getBoundingClientRect();
        return { x: Math.round(s.left + s.width / 2), y: Math.round(s.top + s.height / 2), w: Math.round(s.width) };
    `);

await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
const book = "Books/A philosophy of software design.epub";
let stage = await openReader(book, 17);
out.stage = stage;
// G2: a page drag, released to turn and released to spring.
for (let i = 0; i < 5; i++) {
    await record("page-drag:turn", () => swipe(stage.x + 200, stage.y, -stage.w * 0.5));
    await sleep(600);
}
for (let i = 0; i < 5; i++) {
    await record("page-drag:spring", () => swipe(stage.x, stage.y, -60, 6));
    await sleep(600);
}
// G1: a chapter turn by the clock, and held, in each of the three motions.
for (const motion of ["leaf", "flow", "stack"]) {
    stage = await openReader(book, 10, motion);
    for (let i = 0; i < 5; i++) {
        await record(`chapter-turn:${motion}:clock`, async () => {
            await evaluate(`const view = app.workspace.getLeavesOfType("zettelflow-reader")[0].view; view.go(${i % 2 ? -1 : 1});`);
            await sleep(900);
        });
        await sleep(500);
    }
    for (let i = 0; i < 3; i++) {
        await evaluate(`const view = app.workspace.getLeavesOfType("zettelflow-reader")[0].view; view.pager.goTo(view.pager.views - 1);`);
        await sleep(400);
        await record(`chapter-turn:${motion}:held`, async () => {
            await swipe(stage.x + 200, stage.y, -stage.w * 0.6, 24, 16);
            await sleep(900);
        });
        await sleep(800);
    }
}
await send("Emulation.setTouchEmulationEnabled", { enabled: false });

// G4: the opening and closing shot on a 200-book Library; and one interrupted by a key.
const openLibrary = async () =>
    evaluate(`
        for (const leaf of app.workspace.getLeavesOfType("zettelflow-reader")) leaf.detach();
        await app.commands.executeCommandById("zettelflow:open-library");
        for (let i = 0; i < 200 && document.querySelectorAll(".zettelkasten-flow__shelf-cover").length < 10; i++) await new Promise((r) => setTimeout(r, 50));
        await new Promise((r) => setTimeout(r, 1200));
        for (const leaf of app.workspace.getLeavesOfType("markdown")) leaf.detach(); const covers = [...document.querySelectorAll(".zettelkasten-flow__shelf-cover")].filter((c) => { const b = c.getBoundingClientRect(); const book = c.closest("[data-path], .zettelkasten-flow__shelf-book, .zettelkasten-flow__shelf-desk-card") ?? c.parentElement; const real = !/technical|software/i.test((book?.getAttribute?.("data-path") ?? "") + (book?.textContent ?? "") + (c.getAttribute("aria-label") ?? "")); return real && b.width > 20 && b.top > 0 && b.bottom < innerHeight; });
        const b = covers[0].getBoundingClientRect();
        return { covers: document.querySelectorAll(".zettelkasten-flow__shelf-cover").length, x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
    `);
for (let i = 0; i < 5; i++) {
    const shelf = await openLibrary();
    out.library = shelf;
    await record("open-shot", async () => {
        await click(shelf.x, shelf.y);
        await sleep(1800);
    });
    await sleep(500);
    await record("close-shot", async () => {
        await evaluate(`await app.commands.executeCommandById("zettelflow:reader-exit");`);
        await sleep(1800);
    });
    await sleep(500);
}
{
    const shelf = await openLibrary();
    await record("open-shot:interrupted", async () => {
        await click(shelf.x, shelf.y);
        await sleep(120);
        await key("ArrowRight");
        await sleep(1500);
    });
}

// G3: a shelf drag by touch: long-press, carry across, drop; and one dropped outside.
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
for (let i = 0; i < 5; i++) {
    const shelf = await openLibrary();
    await record(i === 4 ? "shelf-drag:outside" : "shelf-drag", async () => {
        await touch("touchStart", shelf.x, shelf.y);
        await sleep(650);
        for (let s = 1; s <= 24; s++) {
            await touch("touchMove", shelf.x + s * 6, shelf.y + s * (i === 4 ? -12 : 8));
            await sleep(16);
        }
        await touch("touchEnd", shelf.x + 144, shelf.y + (i === 4 ? -288 : 192));
        await sleep(600);
    });
    await sleep(400);
}
await send("Emulation.setTouchEmulationEnabled", { enabled: false });

writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
console.log(`${out.runs.length} runs written`);
ws.close();
process.exit(0);
