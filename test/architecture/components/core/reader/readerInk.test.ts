/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { MarkdownRenderer, TFile, WorkspaceLeaf } from "obsidian";
import { log } from "architecture";
import { DomNode, flush, installBrowserGlobals } from "../../../../support/dashboardDom";
import { recordAnimations, type AnimationRecord } from "../../../../support/motionDom";
import { penStroke, penUp, touchSwipe, touchTap, twoFingers } from "../../../../support/pointer";
import { withPlatform, IPAD } from "../../../../support/platform";
import { press } from "../../../../support/readerKeys";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import { endChapterTurn } from "architecture/components/core/reader/readerTurn";
import { resetReaderWorkspace } from "architecture/components/core/reader/openReader";
import { INK_STORAGE_KEY, type InkStore } from "architecture/components/core/reader/readerInk";
import { GROUP_IDLE_MS } from "application/reader/ink/inkGroup";
import { PALM_WINDOW_MS } from "application/reader/ink/inkInput";
import { parseInkSvg, renderInkSvg, type InkDrawing } from "application/reader/ink/inkSvg";
import type { Thought } from "application/thinking/thought";

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.extension = "md";
    return f;
}

const BODY = Array.from({ length: 6 }, (_, i) => `Paragraph ${i} of the chapter, with words in it.`).join(" ");
const PEN = 7;

/** Two short strokes, in ems, from the note's origin. */
const TWO_STROKES: InkDrawing = {
    strokes: [
        { colour: "pencil", pointerType: "pen", points: [0, 0.5, 1, 1.5, 2].map((x, i) => ({ x, y: 0, p: 0.5, tilt: Math.PI / 2, t: i * 8 })) },
        { colour: "red", pointerType: "pen", points: [0, 0.5, 1, 1.5, 2].map((x, i) => ({ x, y: 1, p: 0.5, tilt: Math.PI / 2, t: i * 8 })) },
    ],
};

function inkThought(id: string, over: Partial<Thought> = {}): Thought {
    return {
        id,
        at: 1,
        text: "",
        links: [],
        about: "a.md",
        quote: { exact: "Paragraph 2", prefix: "in it. ", suffix: " of the" },
        ink: { drawing: `1-${id}.svg`, side: "text", x: 0, line: 0, em: 16 },
        ...over,
    };
}

let clock = 10_000;

function mount(options: { lab?: string; stored?: Thought[]; drawings?: Record<string, string>; local?: string; writeInk?: InkStore["writeInk"] } = {}) {
    const files: Record<string, string> = { "a.md": BODY, "b.md": "The body of B.", "c.md": "The body of C." };
    const local = new Map<string, unknown>(options.local ? [[INK_STORAGE_KEY, options.local]] : []);
    const app = {
        workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), iterateAllLeaves: () => undefined, setActiveLeaf: jest.fn(), trigger: jest.fn() },
        vault: {
            getAbstractFileByPath: (path: string) => (files[path] !== undefined ? file(path) : null),
            cachedRead: async (f: TFile) => files[f.path],
            modify: jest.fn(),
            create: jest.fn(),
        },
        metadataCache: { getFirstLinkpathDest: () => null, on: () => ({}) },
        loadLocalStorage: jest.fn((key: string) => local.get(key) ?? null),
        saveLocalStorage: jest.fn((key: string, value: unknown) => local.set(key, value)),
    };
    const stored = [...(options.stored ?? [])];
    const drawings = new Map<string, string>(Object.entries(options.drawings ?? {}));
    let n = 0;
    const store = {
        folder: jest.fn(() => options.lab ?? "Lab"),
        highlightsAbout: jest.fn(async (path: string) => stored.filter((t) => t.about === path)),
        write: jest.fn(async () => undefined),
        save: jest.fn(async () => undefined),
        writeInk: jest.fn(
            options.writeInk ??
                (async (input: any, svg: string) => {
                    n++;
                    const thought: Thought = { id: `new${n}`, at: n, text: "", links: [], about: input.about, ...(input.quote ? { quote: input.quote } : {}), ink: { ...input.ink, drawing: `${n}-new${n}.svg` } };
                    drawings.set(thought.id, svg);
                    return thought;
                })
        ),
        drawingOf: jest.fn(async (thought: Thought) => drawings.get(thought.id)),
        saveDrawing: jest.fn(async (thought: Thought, svg: string) => void drawings.set(thought.id, svg)),
        discard: jest.fn(async (thought: Thought) => drawings.get(thought.id)),
        restore: jest.fn(async () => undefined),
    };
    const deps = {
        store,
        words: () => ({ words: [{ start: BODY.indexOf("Paragraph 2"), end: BODY.indexOf("Paragraph 2") + 9, left: 120, top: 180, width: 60, height: 16 }], text: BODY }),
        spanBox: () => ({ left: 120, top: 180, width: 60, height: 16 }),
        metrics: jest.fn(() => ({ fontPx: 16, linePx: 28 })),
        text: () => BODY,
        now: () => clock,
    };
    const content = new DomNode();
    const leaf = new WorkspaceLeaf(app, content) as unknown as WorkspaceLeaf & { detach: jest.Mock };
    leaf.detach = jest.fn();
    const view = new ReaderView(leaf, { settings: { readingMotion: { chapter: "stack" } }, saveSettings: jest.fn(async () => undefined) }, { store: store as any }, deps as any);
    return { view, app, content, leaf, store, deps, drawings };
}

async function open(options: Parameters<typeof mount>[0] = {}) {
    const m = mount(options);
    await m.view.setState({ seed: "a.md", kind: "selection", paths: ["a.md", "b.md", "c.md"] }, {} as never);
    await m.view.onOpen();
    await flush();
    const root = m.content.oneByClass("reader") as any;
    const stage = m.content.oneByClass("reader-stage") as any;
    root.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 800 });
    stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 700 });
    stage.clientHeight = 800;
    stage.scrollHeight = 4000;
    stage.scrollBy = jest.fn();
    return { ...m, root, stage };
}

const palette = (content: DomNode) => content.oneByClass("reader-ink-palette");
const layer = (content: DomNode) => content.oneByClass("reader-ink-layer");
const paths = (content: DomNode) => layer(content).findAll((el) => el.tag === "path" && el.isConnected);
const status = (content: DomNode) => content.oneByClass("reader-ink-status");
const count = (content: DomNode) => content.oneByClass("reader-count").textContent;
const word = [
    { x: 300, y: 300 },
    { x: 310, y: 290 },
    { x: 320, y: 305 },
    { x: 330, y: 295 },
    { x: 340, y: 300 },
];
const openPalette = (content: DomNode) => content.oneByClass("reader-ink-button").click();
/** The note's clock and the window's timers move on together. */
function wait(ms: number): void {
    clock += ms;
    jest.advanceTimersByTime(ms);
}

describe("ink in the margin: the palette and the ink layer (#745)", () => {
    let rec: AnimationRecord;
    beforeEach(() => {
        installBrowserGlobals();
        (globalThis as any).innerWidth = 1000;
        (globalThis as any).addEventListener ??= () => undefined;
        (globalThis as any).removeEventListener ??= () => undefined;
        (globalThis as any).matchMedia = () => ({ matches: false });
        resetReaderWorkspace();
        MarkdownRenderer.calls = [];
        clock = 10_000;
        rec = recordAnimations();
        jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick", "queueMicrotask"] });
    });
    afterEach(() => {
        jest.useRealTimers();
        endChapterTurn();
        rec.stop();
        delete (globalThis as any).matchMedia;
        delete (globalThis as any).innerWidth;
    });

    it("opens the palette from the pencil in the bar: pen, eraser, four inks and undo, remembered on this device (FR-1, FR-6)", async () => {
        const { content, app } = await open();
        expect(palette(content).hasClass("is-open")).toBe(false);
        openPalette(content);
        expect(palette(content).hasClass("is-open")).toBe(true);
        expect(content.oneByClass("reader-ink-button").hasClass("is-active")).toBe(true);
        expect(palette(content).byClass("reader-ink-tool").map((b) => b.getAttribute("data-tool"))).toEqual(["pen", "eraser"]);
        expect(palette(content).byClass("reader-ink-colour").map((b) => b.getAttribute("data-colour"))).toEqual(["pencil", "red", "blue", "green"]);
        expect(palette(content).byClass("reader-ink-undo")).toHaveLength(1);
        expect(palette(content).byClass("clickable-icon").length).toBeGreaterThanOrEqual(7);
        expect(app.saveLocalStorage).toHaveBeenCalledWith(INK_STORAGE_KEY, "open");
        // Opening it is the stylesheet's slide, never a scripted animation.
        expect(rec.animations).toHaveLength(0);
    });

    it("opens a reader already inking when this device left the palette open", async () => {
        const { content } = await open({ local: "open" });
        expect(palette(content).hasClass("is-open")).toBe(true);
        expect(content.oneByClass("reader-stage").hasClass("zettelkasten-flow__reader-stage--inking")).toBe(true);
    });

    it("moves the active marker to the tool in use (FR-20)", async () => {
        const { content } = await open();
        openPalette(content);
        expect(palette(content).cssProps["--zf-ink-marker"]).toBe("0");
        palette(content).byClass("reader-ink-tool")[1].click();
        expect(palette(content).cssProps["--zf-ink-marker"]).toBe("1");
        expect(palette(content).byClass("reader-ink-tool")[1].hasClass("is-active")).toBe(true);
    });

    it("draws a pen stroke into the ink layer, the newest piece on the nib, nothing animated (AC-6, FR-18)", async () => {
        const { content, stage } = await withPlatform(IPAD, () => open());
        openPalette(content);
        penStroke(stage, word, { lift: false, pointerId: PEN });
        const nib = layer(content).oneByClass("reader-ink-nib");
        expect(nib.getAttribute("d")?.endsWith("L340 300")).toBe(true);
        expect(paths(content).length).toBeGreaterThan(1);
        penUp(stage, word[4], { pointerId: PEN });
        expect(layer(content).byClass("reader-ink-live")).toHaveLength(1);
        expect(rec.animations).toHaveLength(0);
    });

    it("draws with a mouse too, and nothing at all with the palette closed", async () => {
        const { content, stage } = await open();
        penStroke(stage, word, { type: "mouse" });
        expect(paths(content)).toHaveLength(0);
        openPalette(content);
        penStroke(stage, word, { type: "mouse" });
        expect(paths(content).length).toBeGreaterThan(0);
    });

    it("leaves a finger to the page: a swipe still turns the chapter with the palette open (FR-2)", async () => {
        const { content, stage } = await withPlatform(IPAD, () => open());
        openPalette(content);
        touchSwipe(stage, { x: 800, y: 400 }, { x: 400, y: 410 });
        await flush();
        expect(count(content)).toBe("02 / 03");
    });

    it("rejects a palm: a touch while the pen is down, or just after it lifts, neither scrolls nor turns (FR-3)", async () => {
        const { content, stage } = await withPlatform(IPAD, () => open());
        openPalette(content);
        penStroke(stage, word, { lift: false, pointerId: PEN });
        touchTap(stage, { x: 900, y: 400 });
        expect(stage.scrollBy).not.toHaveBeenCalled();
        penUp(stage, word[4], { pointerId: PEN });
        clock += PALM_WINDOW_MS;
        touchTap(stage, { x: 900, y: 400 });
        expect(stage.scrollBy).not.toHaveBeenCalled();
        // …and a moment later a finger is a finger again.
        clock += 1;
        touchTap(stage, { x: 900, y: 400 });
        expect(stage.scrollBy).toHaveBeenCalledTimes(1);
        // A stylus touch is never a scroll; a finger's is.
        const stylus = stage.fire("touchstart", { cancelable: true, touches: [{ clientX: 500 }], changedTouches: [{ clientX: 500, touchType: "stylus" }] });
        expect(stylus.defaultPrevented).toBe(true);
        const finger = stage.fire("touchmove", { cancelable: true, touches: [{ clientX: 500 }], changedTouches: [{ clientX: 500, touchType: "direct" }] });
        expect(finger.defaultPrevented).toBe(false);
    });

    it("keeps an ink note once it goes idle: one write of a thought and its drawing, about the note (AC-4, AC-5)", async () => {
        const { content, stage, store, app } = await open();
        openPalette(content);
        penStroke(stage, word, { pointerId: PEN });
        penStroke(stage, word.map((p) => ({ ...p, x: p.x + 40 })), { pointerId: PEN });
        expect(store.writeInk).not.toHaveBeenCalled();
        wait(GROUP_IDLE_MS);
        await flush();
        expect(store.writeInk).toHaveBeenCalledTimes(1);
        const [input, svg] = store.writeInk.mock.calls[0] as [any, string];
        expect(input.about).toBe("a.md");
        expect(input.quote.exact).toBe("Paragraph");
        // The body is 100 px wide here: the word was written in its right margin.
        expect(input.ink).toMatchObject({ side: "right", em: 16 });
        const drawing = parseInkSvg(svg) as InkDrawing;
        expect(drawing.strokes).toHaveLength(2);
        // Kept quietly: the ink settles into its kept tone, and no line shows over the page.
        const note = layer(content).oneByClass("reader-ink-note");
        expect(note.hasClass("zettelkasten-flow__reader-ink--kept")).toBe(true);
        expect(status(content).hasClass("is-shown")).toBe(false);
        // The note being read is never written.
        expect(app.vault.modify).not.toHaveBeenCalled();
        expect(app.vault.create).not.toHaveBeenCalled();
        expect(store.write).not.toHaveBeenCalled();
    });

    it("keeps the note before the chapter turns, and before the Reader closes (AC-4, FR-9)", async () => {
        const { content, stage, store, view } = await open();
        openPalette(content);
        penStroke(stage, word, { pointerId: PEN });
        press(content as never, "ArrowRight");
        expect(store.writeInk).toHaveBeenCalledTimes(1);
        await flush();
        expect(count(content)).toBe("02 / 03");
        penStroke(stage, word, { pointerId: PEN });
        view.exit();
        expect(store.writeInk).toHaveBeenCalledTimes(2);
    });

    it("never writes a stroke undone before its note was kept (AC-8)", async () => {
        const { content, stage, store } = await open();
        openPalette(content);
        penStroke(stage, word, { pointerId: PEN });
        content.oneByClass("reader-ink-undo").click();
        await flush();
        expect(rec.animations.at(-1)?.keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }]);
        rec.finishAll();
        expect(paths(content)).toHaveLength(0);
        wait(GROUP_IDLE_MS * 2);
        await flush();
        expect(store.writeInk).not.toHaveBeenCalled();
    });

    it("never undoes ink that is no longer on screen: undo belongs to the chapter", async () => {
        const { content, stage, store } = await open();
        openPalette(content);
        penStroke(stage, word, { pointerId: PEN });
        press(content as never, "ArrowRight");
        await flush();
        content.oneByClass("reader-ink-undo").click();
        await flush();
        expect(store.writeInk).toHaveBeenCalledTimes(1);
        expect(store.saveDrawing).not.toHaveBeenCalled();
        expect(store.discard).not.toHaveBeenCalled();
    });

    it("waits for a write in flight before undoing its stroke, so the file never keeps it", async () => {
        let finish: (thought: Thought) => void = () => undefined;
        const { content, stage, store } = await open({
            writeInk: (input: any) =>
                new Promise<Thought>((resolve) => {
                    finish = () => resolve({ id: "w1", at: 1, text: "", links: [], about: input.about, ink: { ...input.ink, drawing: "1-w1.svg" } });
                }),
        });
        openPalette(content);
        penStroke(stage, word, { pointerId: PEN });
        wait(GROUP_IDLE_MS);
        await flush();
        expect(store.writeInk).toHaveBeenCalledTimes(1);
        content.oneByClass("reader-ink-undo").click();
        await flush();
        expect(store.discard).not.toHaveBeenCalled();
        finish({} as Thought);
        await flush();
        expect(store.discard).toHaveBeenCalledWith(expect.objectContaining({ id: "w1" }));
    });

    it("undoes with two fingers tapped together — with no toast — and never with a pinch (FR-8, FR-21)", async () => {
        const { content, stage, store } = await withPlatform(IPAD, () => open());
        openPalette(content);
        penStroke(stage, word, { pointerId: PEN });
        clock += 1000;
        twoFingers(stage, { x: 400, y: 500 }, { x: 500, y: 500 }, { travel: 20, apart: true });
        await flush();
        expect(layer(content).byClass("reader-ink-live")).toHaveLength(1);
        twoFingers(stage, { x: 400, y: 500 }, { x: 500, y: 500 });
        await flush();
        rec.finishAll();
        expect(layer(content).byClass("reader-ink-live").filter((el) => el.isConnected)).toHaveLength(0);
        expect(status(content).hasClass("is-shown")).toBe(false);
        expect(rec.keys()).toEqual(new Set(["opacity"]));
        wait(GROUP_IDLE_MS * 2);
        await flush();
        expect(store.writeInk).not.toHaveBeenCalled();
    });

    it("undoes with Ctrl/Cmd+Z while the palette is open, and leaves the key to Obsidian otherwise", async () => {
        const { content, stage, view } = await open();
        const mod = () => (view as any).scope.handleKey({ key: "z", preventDefault: () => undefined }, { modifiers: "Mod", key: "z" });
        expect(mod()).toBe(true);
        openPalette(content);
        penStroke(stage, word, { pointerId: PEN });
        expect(mod()).toBe(false);
        rec.finishAll();
        expect(paths(content)).toHaveLength(0);
    });

    it("opens and closes with P, and Esc closes the palette before anything else (G2, G3)", async () => {
        const { content, leaf } = await open();
        press(content as never, "p");
        expect(palette(content).hasClass("is-open")).toBe(true);
        press(content as never, "Escape");
        expect(palette(content).hasClass("is-open")).toBe(false);
        expect((leaf as any).detach).not.toHaveBeenCalled();
    });

    it("draws a stored ink note beside its words, and moves it with the type in the same frame (AC-1, FR-22)", async () => {
        const stored = [inkThought("k1")];
        const { content, deps, view } = await open({ stored, drawings: { k1: renderInkSvg(TWO_STROKES) } });
        await flush();
        const note = layer(content).oneByClass("reader-ink-note");
        expect(note.getAttribute("data-ink")).toBe("k1");
        expect(note.cssProps).toMatchObject({ "--zf-ink-x": "0px", "--zf-ink-y": "180px", "--zf-ink-scale": "16" });
        // The type grows: the ink goes with it, at once, with no animation.
        deps.metrics.mockReturnValue({ fontPx: 20, linePx: 35 });
        (view as any).layoutInk();
        expect(note.cssProps["--zf-ink-scale"]).toBe("20");
        expect(rec.animations).toHaveLength(0);
        // It is listed beside the highlights, with a small drawing of itself.
        const row = content.oneByClass("reader-ink-item");
        expect(row.byClass("reader-ink-thumb")).toHaveLength(1);
    });

    it("lists ink it cannot draw here, with why — and never draws it (AC-12, FR-12)", async () => {
        const detached = inkThought("d1", { quote: { exact: "words that are gone", prefix: "", suffix: "" } });
        const page = inkThought("p1", { quote: undefined, ink: { drawing: "1-p1.svg", page: { px: 0.1, py: 0.1, pw: 0.2, ph: 0.1 } } });
        const future = inkThought("f1");
        const { content } = await open({
            stored: [detached, page, future],
            drawings: { d1: renderInkSvg(TWO_STROKES), p1: renderInkSvg(TWO_STROKES), f1: renderInkSvg(TWO_STROKES).replace('"v":1', '"v":99') },
        });
        await flush();
        expect(layer(content).byClass("reader-ink-note")).toHaveLength(0);
        const reasons = content.byClass("reader-ink-item-reason").map((el) => el.textContent);
        expect(reasons).toEqual(expect.arrayContaining(["Detached — the passage has changed", "Written in Page view", "Ink from a newer version, not drawn here"]));
    });

    it("deletes an ink note from its row: the thought and its drawing go to the trash together, with Undo (FR-14)", async () => {
        const { content, store } = await open({ stored: [inkThought("k1")], drawings: { k1: renderInkSvg(TWO_STROKES) } });
        await flush();
        content.oneByClass("reader-ink-item").byText("Delete ink")!.click();
        await flush();
        expect(store.discard).toHaveBeenCalledTimes(1);
        expect(status(content).textContent).toContain("Ink removed.");
        status(content).byText("Undo")!.click();
        await flush();
        expect(store.restore).toHaveBeenCalledWith(expect.objectContaining({ id: "k1" }), renderInkSvg(TWO_STROKES));
    });

    it("erases a stroke whole, and brings it back with undo (AC-9, FR-7)", async () => {
        const { content, stage, store, drawings } = await open({ stored: [inkThought("k1")], drawings: { k1: renderInkSvg(TWO_STROKES) } });
        await flush();
        openPalette(content);
        palette(content).byClass("reader-ink-tool")[1].click();
        // The first stroke runs from (0, 180) to (32, 180) on the page.
        penStroke(stage, [{ x: 10, y: 182 }, { x: 20, y: 181 }], { pointerId: PEN });
        await flush();
        expect(store.saveDrawing).toHaveBeenCalledTimes(1);
        expect((parseInkSvg(drawings.get("k1")!) as InkDrawing).strokes.map((s) => s.colour)).toEqual(["red"]);
        content.oneByClass("reader-ink-undo").click();
        await flush();
        expect((parseInkSvg(drawings.get("k1")!) as InkDrawing).strokes).toHaveLength(2);
    });

    it("sends the note to the trash when its last stroke is erased, with Undo (AC-9)", async () => {
        const one: InkDrawing = { strokes: [TWO_STROKES.strokes[0]] };
        const { content, stage, store } = await open({ stored: [inkThought("k1")], drawings: { k1: renderInkSvg(one) } });
        await flush();
        openPalette(content);
        palette(content).byClass("reader-ink-tool")[1].click();
        penStroke(stage, [{ x: 10, y: 182 }, { x: 20, y: 181 }], { pointerId: PEN });
        await flush();
        expect(store.discard).toHaveBeenCalledTimes(1);
        expect(status(content).textContent).toContain("Ink removed.");
        status(content).byText("Undo")!.click();
        await flush();
        expect(store.restore).toHaveBeenCalledWith(expect.objectContaining({ id: "k1" }), renderInkSvg(one));
    });

    it("says so quietly when the eraser touches nothing", async () => {
        const { content, stage, store } = await open();
        openPalette(content);
        palette(content).byClass("reader-ink-tool")[1].click();
        penStroke(stage, [{ x: 600, y: 600 }, { x: 610, y: 600 }], { pointerId: PEN });
        expect(status(content).textContent).toBe("Nothing under the eraser");
        expect(store.saveDrawing).not.toHaveBeenCalled();
    });

    it("explains where ink is kept with no thinking space, and draws nothing (AC-13, FR-15)", async () => {
        const { content, stage, store } = await open({ lab: "" });
        openPalette(content);
        expect(status(content).textContent).toBe("Ink is kept in Think. Set a thinking space folder in Settings › Thinking to write.");
        penStroke(stage, word, { pointerId: PEN });
        expect(paths(content)).toHaveLength(0);
        wait(GROUP_IDLE_MS);
        expect(store.writeInk).not.toHaveBeenCalled();
    });

    it("keeps the strokes on screen when a write fails, says so, and logs it (FR-23)", async () => {
        const error = jest.spyOn(log, "error");
        const { content, stage } = await open({ writeInk: async () => Promise.reject(new Error("disk full")) });
        openPalette(content);
        penStroke(stage, word, { pointerId: PEN });
        wait(GROUP_IDLE_MS);
        await flush();
        expect(status(content).textContent).toContain("Could not keep that");
        expect(paths(content).length).toBeGreaterThan(0);
        expect(layer(content).oneByClass("reader-ink-note").hasClass("zettelkasten-flow__reader-ink--live")).toBe(true);
        expect(error).toHaveBeenCalled();
        error.mockRestore();
    });

    it("is all instant under reduced motion, and still draws (FR-24)", async () => {
        (globalThis as any).matchMedia = () => ({ matches: true });
        const { content, stage } = await open();
        openPalette(content);
        penStroke(stage, word, { pointerId: PEN });
        expect(paths(content).length).toBeGreaterThan(0);
        content.oneByClass("reader-ink-undo").click();
        await flush();
        expect(rec.animations).toHaveLength(0);
        expect(paths(content)).toHaveLength(0);
    });
});
