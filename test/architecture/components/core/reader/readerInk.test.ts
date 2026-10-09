/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Component, MarkdownRenderer, TFile, WorkspaceLeaf } from "obsidian";
import { log } from "architecture";
import { DomNode, flush, installBrowserGlobals } from "../../../../support/dashboardDom";
import { recordAnimations, type AnimationRecord } from "../../../../support/motionDom";
import { penStroke, penUp, touchSwipe, touchTap, twoFingers } from "../../../../support/pointer";
import { withPlatform, IPAD } from "../../../../support/platform";
import { press } from "../../../../support/readerKeys";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import { endChapterTurn } from "architecture/components/core/reader/readerTurn";
import { resetReaderWorkspace } from "architecture/components/core/reader/openReader";
import { INK_STORAGE_KEY, ReaderInk, type InkStore } from "architecture/components/core/reader/readerInk";
import { ReaderHighlights } from "architecture/components/core/reader/readerHighlights";
import { chapterText } from "architecture/components/core/reader/readerMarks";
import { MOTION } from "architecture/components/core/reader/readerMotion";
import { currentWriteBatch } from "architecture/plugin/writes/recordVaultWrite";
import { EXTEND_WINDOW_MS } from "application/reader/ink/strokeHighlight";
import type { WordBox } from "application/reader/ink/inkAnchor";
import type { PageText } from "application/library/pdfWords";
import { FakeEl } from "../../../../support/textDom";
import { loadInk } from "../../../../support/inkFixtures";
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
const tool = (content: DomNode, name: string) => palette(content).byClass("reader-ink-tool").find((b) => b.getAttribute("data-tool") === name)!;
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

    it("opens the palette from the pencil in the bar: pen, highlighter, lasso, eraser, four inks and undo, remembered on this device (FR-1, FR-6, #747 FR-7)", async () => {
        const { content, app } = await open();
        expect(palette(content).hasClass("is-open")).toBe(false);
        openPalette(content);
        expect(palette(content).hasClass("is-open")).toBe(true);
        expect(content.oneByClass("reader-ink-button").hasClass("is-active")).toBe(true);
        expect(palette(content).byClass("reader-ink-tool").map((b) => b.getAttribute("data-tool"))).toEqual(["pen", "highlighter", "lasso", "eraser"]);
        expect(palette(content).byClass("reader-ink-colour").map((b) => b.getAttribute("data-colour"))).toEqual(["pencil", "red", "blue", "green"]);
        expect(palette(content).byClass("reader-ink-undo")).toHaveLength(1);
        expect(palette(content).byClass("clickable-icon").length).toBeGreaterThanOrEqual(8);
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
        tool(content, "eraser").click();
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
        tool(content, "eraser").click();
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
        tool(content, "eraser").click();
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

// ── #746: draw across a line and it is highlighted ──────────────────────────────────────────────

/** The chapter: two paragraphs of words, laid out six words to a line, 8 px a letter, 28 px a line. */
const PROSE = ["Event sourcing stores changes and not the state of things,", "so a replay rebuilds it from the log of every change made."];
const TOP = 100;
const LINE = 28;
const LEFT = 100;

function chapterEl(): FakeEl {
    return new FakeEl(
        "div",
        PROSE.map((text) => new FakeEl("p", [text]))
    );
}

/** Where each word of the chapter sits on screen: what the real page measures with a Range. */
function layout(text: string): WordBox[] {
    const words: WordBox[] = [];
    let i = 0;
    let x = LEFT;
    for (const match of text.matchAll(/\S+/g)) {
        const line = Math.floor(i / 6);
        if (i % 6 === 0) x = LEFT;
        const width = match[0].length * 8;
        words.push({ start: match.index!, end: match.index! + match[0].length, left: x, top: TOP + line * LINE + 6, width, height: 16 });
        x += width + 8;
        i++;
    }
    return words;
}
const middle = (line: number) => TOP + line * LINE + 14;
/** A pen drawn along line `line`, from `from` to `to`, with the slight tremor a hand has. */
const along = (line: number, from = 90, to = 480) => Array.from({ length: 13 }, (_, k) => ({ x: from + ((to - from) * k) / 12, y: middle(line) + (k % 2 ? 1 : -1) }));

function direct(options: { lab?: string; pageWords?: (index: number) => Promise<PageText | null>; run?: boolean; writePending?: boolean; textRects?: boolean } = {}) {
    const body = chapterEl();
    const text = chapterText(body as never);
    const words = layout(text);
    const root = new DomNode();
    const stage = new DomNode();
    const page = new DomNode();
    stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 700 });
    page.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 2000 });
    root.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 800 });
    (body as any).getBoundingClientRect = () => ({ left: LEFT, top: 0, width: 600, height: 2000 });
    const batches: Record<string, (string | undefined)[]> = { write: [], save: [], discard: [], writeInk: [] };
    let n = 0;
    let release: () => void = () => undefined;
    const store = {
        folder: () => options.lab ?? "Lab",
        highlightsAbout: jest.fn(async () => [] as Thought[]),
        write: jest.fn(async (note: string, o: any) => {
            batches.write.push(currentWriteBatch());
            if (options.writePending) await new Promise<void>((resolve) => (release = resolve));
            const made: Thought = { id: `hl${++n}`, at: n, text: note, links: [], about: o.about, quote: o.quote, ...(o.locator ? { locator: o.locator } : {}), meaning: o.meaning };
            return made;
        }),
        save: jest.fn(async (_t: Thought) => {
            batches.save.push(currentWriteBatch());
        }),
        writeInk: jest.fn(async (input: any, _svg: string) => {
            batches.writeInk.push(currentWriteBatch());
            return { id: `ink${++n}`, at: n, text: "", links: [], about: input.about, ink: { ...input.ink, drawing: `${n}.svg` } } as unknown as Thought;
        }),
        drawingOf: jest.fn(async () => undefined),
        saveDrawing: jest.fn(async () => undefined),
        discard: jest.fn(async (_t: Thought) => {
            batches.discard.push(currentWriteBatch());
        }),
        restore: jest.fn(async () => undefined),
    };
    const owner = new Component();
    const highlights = new ReaderHighlights(
        { app: {} as never, host: root as never, owner, scrollTo: jest.fn(), onChange: jest.fn() },
        {
            store: store as never,
            selection: () => null,
            headingAt: () => undefined,
            makeMark: (id) => {
                const mark = new FakeEl("mark");
                mark.attrs["data-hl"] = id;
                // Where its words are (#747 gestures land on marks), or one fixed box (#746).
                (mark as any).getClientRects = () => (options.textRects ? boxesOf(mark.textContent, text, words) : [{ left: 120, top: 134, width: 200, height: 16 }]);
                return mark as never;
            },
        }
    );
    const ink = new ReaderInk(
        { app: {} as never, root: root as never, stage: () => stage as never, owner, refreshList: jest.fn(), highlights: () => highlights, pageWords: options.pageWords, pageLabel: (i) => `p. ${i + 1}` },
        { store: store as never, words: () => ({ words, text }), spanBox: () => null, metrics: () => ({ fontPx: 16, linePx: LINE }), text: () => text, now: () => clock }
    );
    const component = new Component();
    void highlights.attach(body as never, "a.md", component, null);
    ink.attach({ body: body as never, page: page as never, notePath: "a.md", locator: null, component, run: options.run ?? false });
    ink.openPalette(false);
    let pointer = 40;
    /** A stroke straight into the ink layer: down, through every point, up. */
    const draw = (points: { x: number; y: number }[], o: { type?: string; target?: DomNode; lift?: boolean } = {}) => {
        const id = ++pointer;
        let t = clock;
        const ev = (p: { x: number; y: number }, extra: Record<string, unknown> = {}) =>
            ({ pointerType: o.type ?? "pen", pointerId: id, clientX: p.x, clientY: p.y, timeStamp: (t += 8), button: 0, buttons: 1, pressure: 0.5, target: o.target ?? stage, preventDefault: () => undefined, ...extra }) as unknown as PointerEvent;
        ink.claims(ev(points[0]));
        for (const p of points.slice(1)) ink.move(ev(p));
        if (o.lift !== false) ink.up(ev(points[points.length - 1], { pressure: 0, buttons: 0 }));
    };
    const pick = (name: string) =>
        root
            .oneByClass("reader-ink-palette")
            .byClass("reader-ink-tool")
            .find((b) => b.getAttribute("data-tool") === name)!
            .click();
    const marks = () => body.all("mark");
    const status = () => root.byClass("reader-hl-pop--status")[0];
    const button = (label: string) => status()?.find((el) => el.tag === "button" && el.textContent === label);
    return { ink, highlights, store, batches, root, stage, page, body, text, words, draw, pick, marks, status, button, release: () => release() };
}

/** The box of each line's run of the words a mark's text covers, as `getClientRects` gives them. */
function boxesOf(exact: string, text: string, words: WordBox[]): { left: number; top: number; width: number; height: number }[] {
    const at = text.indexOf(exact);
    if (at < 0 || !exact.trim()) return [];
    const under = words.filter((w) => w.start < at + exact.length && w.end > at);
    const lines = new Map<number, WordBox[]>();
    for (const w of under) lines.set(w.top, [...(lines.get(w.top) ?? []), w]);
    return [...lines.values()].map((ws) => {
        const left = Math.min(...ws.map((w) => w.left));
        const right = Math.max(...ws.map((w) => w.left + w.width));
        return { left, top: ws[0].top, width: right - left, height: ws[0].height };
    });
}

const LINE_1 = (m: { words: WordBox[]; text: string }) => {
    const line = m.words.filter((w) => w.top === TOP + LINE + 6);
    return m.text.slice(line[0].start, line[line.length - 1].end);
};

describe("draw across a line and it is highlighted (#746)", () => {
    let rec: AnimationRecord;
    beforeEach(() => {
        installBrowserGlobals();
        (globalThis as any).matchMedia = () => ({ matches: false });
        clock = 10_000;
        rec = recordAnimations();
        jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick", "queueMicrotask"] });
    });
    afterEach(() => {
        jest.useRealTimers();
        rec.stop();
        delete (globalThis as any).matchMedia;
    });

    it("keeps a pen stroke along a line as a highlight of its words: one write of a highlight, no ink (FR-1, FR-2)", async () => {
        const m = direct();
        await flush();
        m.draw(along(1));
        await flush();
        expect(m.store.write).toHaveBeenCalledTimes(1);
        const [, options] = m.store.write.mock.calls[0] as [string, any];
        expect(options.quote.exact).toBe(LINE_1(m));
        expect(options).toMatchObject({ about: "a.md", meaning: "idea" });
        expect(m.marks().map((mark) => mark.textContent).join("")).toBe(options.quote.exact);
        wait(GROUP_IDLE_MS * 2);
        await flush();
        expect(m.store.writeInk).not.toHaveBeenCalled();
    });

    it("leaves handwriting as ink, over the words or in the margin (AC-1, the negative)", async () => {
        const m = direct();
        await flush();
        const written = loadInk("write-flat-synth-01").strokes[0].points.map((p) => ({ x: 200 + p.x * 16, y: middle(1) - 4 + p.y * 16 }));
        m.draw(written);
        m.draw(along(1, 700, 990));
        wait(GROUP_IDLE_MS);
        await flush();
        expect(m.store.write).not.toHaveBeenCalled();
        // Far apart: two ink notes, and no highlight.
        expect(m.store.writeInk).toHaveBeenCalledTimes(2);
        expect(m.marks()).toHaveLength(0);
    });

    it("takes the meaning H uses: an idea at first, then the one chosen last (FR-4, AC-4)", async () => {
        const m = direct();
        await flush();
        const first = m.highlights.quoteFor(0, 5)!;
        await m.highlights.keepSpan(first.span, first.quote, { meaning: "question", origin: "selection" });
        m.draw(along(1));
        await flush();
        expect((m.store.write.mock.calls[1] as [string, any])[1].meaning).toBe("question");
    });

    it("turns any highlighter stroke over words into a highlight, and keeps nothing over the margin (FR-6, AC-6)", async () => {
        const m = direct();
        await flush();
        m.pick("highlighter");
        // A wiggle no pen line would be, still over the words of line 0.
        m.draw([0, 1, 2, 3, 4, 5, 6].map((k) => ({ x: 110 + k * 40, y: middle(0) + (k % 2 ? 7 : -7) })));
        await flush();
        expect(m.store.write).toHaveBeenCalledTimes(1);
        m.draw(along(0, 750, 990));
        await flush();
        expect(m.root.oneByClass("reader-ink-status").textContent).toBe("Nothing under the highlighter");
        wait(GROUP_IDLE_MS * 2);
        await flush();
        expect(m.store.write).toHaveBeenCalledTimes(1);
        expect(m.store.writeInk).not.toHaveBeenCalled();
    });

    it("draws the highlighter as one, in the meaning's wash, while you draw (FR-15)", async () => {
        const m = direct();
        await flush();
        m.pick("highlighter");
        m.draw(along(0), { lift: false });
        const g = m.page.find((el) => el.hasClass("zettelkasten-flow__reader-ink-live"))!;
        expect(g.hasClass("zettelkasten-flow__reader-ink--highlighter")).toBe(true);
        expect(g.hasClass("zettelkasten-flow__reader-ink--hl-idea")).toBe(true);
        expect(Number(g.cssProps["--zf-hl-nib"])).toBeCloseTo(LINE * 0.9, 1);
    });

    it("says what it kept, with Undo and Keep as ink (FR-7, AC-7)", async () => {
        const m = direct();
        await flush();
        m.draw(along(1));
        await flush();
        expect(m.status().textContent).toContain("Highlighted as an idea. Kept in Think.");
        expect(m.button("Keep as ink")).toBeDefined();
        m.button("Undo")!.click();
        await flush();
        expect(m.store.discard).toHaveBeenCalledWith(expect.objectContaining({ id: "hl1" }));
        expect(m.marks()).toHaveLength(0);
        // Taken back: the palette's undo has nothing more of it to take.
        expect(m.ink.undoKey()).toBe(false);
    });

    it("keeps the stroke as ink instead: the highlight to the trash and one ink note, in one batch (FR-7, AC-7)", async () => {
        const m = direct();
        await flush();
        m.draw(along(1));
        await flush();
        m.button("Keep as ink")!.click();
        await flush();
        expect(m.store.discard).toHaveBeenCalledTimes(1);
        expect(m.store.writeInk).toHaveBeenCalledTimes(1);
        expect(m.batches.discard[0]).toBeDefined();
        expect(m.batches.writeInk[0]).toBe(m.batches.discard[0]);
        const svg = (m.store.writeInk.mock.calls[0] as [any, string])[1];
        expect((parseInkSvg(svg) as InkDrawing).strokes).toHaveLength(1);
        expect(m.marks()).toHaveLength(0);
        // The stroke comes back as a note: it fades in where it was drawn.
        expect(rec.animations.some((a) => a.keyframes[0]?.opacity === 0 && a.keyframes[1]?.opacity === 1 && a.duration === MOTION.fast)).toBe(true);
    });

    it("keeps the highlight, and writes no ink, when Keep as ink cannot take it back: never both", async () => {
        const error = jest.spyOn(log, "error").mockImplementation(() => undefined);
        const m = direct();
        await flush();
        m.draw(along(1));
        await flush();
        m.store.discard.mockImplementationOnce(async () => Promise.reject(new Error("locked")));
        m.button("Keep as ink")!.click();
        await flush();
        expect(m.store.writeInk).not.toHaveBeenCalled();
        expect(m.marks().length).toBeGreaterThan(0);
        error.mockRestore();
    });

    it("is the session's last ink action: the palette's undo and two fingers take it back (FR-7)", async () => {
        const m = direct();
        await flush();
        m.draw(along(1));
        await flush();
        m.root.oneByClass("reader-ink-undo").click();
        await flush();
        expect(m.store.discard).toHaveBeenCalledTimes(1);
        m.draw(along(0));
        await flush();
        clock += 1000;
        const finger = (id: number, x: number, t: number) => ({ pointerType: "touch", pointerId: id, clientX: x, clientY: 500, timeStamp: t, button: 0 }) as unknown as PointerEvent;
        m.ink.claims(finger(91, 400, 5000));
        m.ink.claims(finger(92, 500, 5005));
        m.ink.up(finger(91, 400, 5100));
        m.ink.up(finger(92, 500, 5105));
        await flush();
        expect(m.store.discard).toHaveBeenCalledTimes(2);
    });

    it("grows the same highlight onto the next line drawn soon after: one update, only the new words sweep (FR-5, FR-13, AC-5)", async () => {
        const m = direct();
        await flush();
        m.draw(along(0));
        await flush();
        m.marks().forEach((mark) => mark.removeClass("zettelkasten-flow__reader-highlight--new"));
        clock += 3000;
        m.draw(along(1));
        await flush();
        expect(m.store.write).toHaveBeenCalledTimes(1);
        expect(m.store.save).toHaveBeenCalledTimes(1);
        expect((m.store.save.mock.calls[0] as [Thought])[0].id).toBe("hl1");
        const fresh = m.marks().filter((mark) => mark.hasClass("zettelkasten-flow__reader-highlight--new"));
        expect(fresh.map((mark) => mark.textContent).join("").trim()).toBe(LINE_1(m));
        // Undo takes the extension back, and only it.
        m.button("Undo")!.click();
        await flush();
        expect(m.store.save).toHaveBeenCalledTimes(2);
        expect(m.store.discard).not.toHaveBeenCalled();
    });

    it("makes a second highlight when the next line comes too late (AC-5)", async () => {
        const m = direct();
        await flush();
        m.draw(along(0));
        await flush();
        clock += EXTEND_WINDOW_MS + 1;
        m.draw(along(1));
        await flush();
        expect(m.store.write).toHaveBeenCalledTimes(2);
        expect(m.store.save).not.toHaveBeenCalled();
    });

    it("turns the stroke into the mark: the ink fades as the mark sweeps from where it began, before the write answers (FR-11, FR-12)", async () => {
        const m = direct({ writePending: true });
        await flush();
        m.draw(along(1, 480, 90)); // right to left
        // The write is still pending: the marks are already on the words, sweeping from the right.
        expect(m.store.write).toHaveBeenCalledTimes(1);
        expect(m.marks().length).toBeGreaterThan(0);
        for (const mark of m.marks()) {
            expect(mark.hasClass("zettelkasten-flow__reader-highlight--new")).toBe(true);
            expect(mark.hasClass("zettelkasten-flow__reader-highlight--new-rtl")).toBe(true);
        }
        const fade = rec.animations.find((a) => a.target.hasClass?.("zettelkasten-flow__reader-ink-live"));
        expect(fade?.keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }]);
        expect(fade?.duration).toBe(MOTION.base);
        m.release();
        await flush();
        expect(m.marks()[0].attrs["data-hl"]).toBe("hl1");
    });

    it("fades the mark away on Undo: opacity only, 120 ms (FR-14)", async () => {
        const m = direct();
        await flush();
        m.draw(along(1));
        await flush();
        const before = rec.animations.length;
        m.button("Undo")!.click();
        await flush();
        const washes = rec.animations.slice(before);
        expect(washes.length).toBeGreaterThan(0);
        for (const a of washes) {
            expect(a.duration).toBe(MOTION.fast);
            expect(new Set(a.keyframes.flatMap((k) => Object.keys(k)))).toEqual(new Set(["opacity"]));
        }
    });

    it("is instant under reduced motion: the stroke goes and the mark is there (FR-16)", async () => {
        (globalThis as any).matchMedia = () => ({ matches: true });
        const m = direct();
        await flush();
        m.draw(along(1));
        await flush();
        expect(m.marks().length).toBeGreaterThan(0);
        expect(m.page.findAll((el) => el.hasClass("zettelkasten-flow__reader-ink-live") && el.isConnected)).toHaveLength(0);
        m.button("Undo")!.click();
        await flush();
        expect(rec.animations).toHaveLength(0);
    });
});

describe("draw across a line on a printed page (#746 FR-9, AC-8)", () => {
    let rec: AnimationRecord;
    beforeEach(() => {
        installBrowserGlobals();
        (globalThis as any).matchMedia = () => ({ matches: false });
        clock = 10_000;
        rec = recordAnimations();
        jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick", "queueMicrotask"] });
    });
    afterEach(() => {
        jest.useRealTimers();
        rec.stop();
        delete (globalThis as any).matchMedia;
    });

    /** A printed page, its words in fractions: two printed lines of nine words, then eight. */
    const PRINTED: PageText = (() => {
        const text = "Page three says something about consistency here and there.Second line of the printed page goes on.";
        const words = [...text.matchAll(/\S+/g)].map((m, i) => ({ start: m.index!, end: m.index! + m[0].length, left: 0.05 + (i % 9) * 0.1, top: i < 9 ? 0.2 : 0.23, width: 0.08, height: 0.02 }));
        return { text, words, headings: [] };
    })();

    async function printed(text: PageText | null) {
        const m = direct({ run: true, pageWords: async () => text });
        const slot = new DomNode();
        slot.addClass("zettelkasten-flow__reader-pv-slot");
        slot.setAttribute("data-page", "2");
        slot.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 520 });
        m.page.appendChild(slot);
        m.ink.decorateSlot(2, slot as never, 1.3);
        // Uncropped, the page's ink surface lies exactly over its slot, as it is laid out.
        for (const svg of slot.byClass("reader-ink-page")) (svg as any).getBoundingClientRect = slot.getBoundingClientRect;
        await flush();
        return { ...m, slot };
    }
    /** Along the first printed line (top 0.2, height 0.02 of 520 px). */
    const printedLine = (from = 15, to = 385) => Array.from({ length: 13 }, (_, k) => ({ x: from + ((to - from) * k) / 12, y: 0.21 * 520 + (k % 2 ? 0.5 : -0.5) }));

    it("keeps a line of a text page as a highlight cited at that page, drawn as rectangles over its words", async () => {
        const m = await printed(PRINTED);
        m.draw(printedLine(), { target: m.slot });
        await flush();
        expect(m.store.write).toHaveBeenCalledTimes(1);
        const [, options] = m.store.write.mock.calls[0] as [string, any];
        expect(options.locator).toEqual({ at: 2, label: "p. 3" });
        expect(options.quote.exact).toBe("Page three says something about consistency here and there.Second");
        const rects = m.slot.byClass("reader-ink-pagemark");
        expect(rects).toHaveLength(1);
        expect(rects[0].hasClass("zettelkasten-flow__reader-ink-pagemark--new")).toBe(true);
        expect(rects[0].cssProps["--zf-pm-y"]).toBe("20%");
        wait(GROUP_IDLE_MS * 2);
        await flush();
        expect(m.store.writeInk).not.toHaveBeenCalled();
    });

    it("leaves a stroke on a page with no text, a scan, as ink, and makes no highlight (AC-8, the empty state)", async () => {
        const m = await printed({ text: "", words: [], headings: [] });
        m.draw(printedLine(), { target: m.slot });
        wait(GROUP_IDLE_MS);
        await flush();
        expect(m.store.write).not.toHaveBeenCalled();
        expect(m.store.writeInk).toHaveBeenCalledTimes(1);
        expect((m.store.writeInk.mock.calls[0] as [any])[0].ink.page).toBeDefined();
    });

    it("takes the rectangles away with Undo", async () => {
        const m = await printed(PRINTED);
        m.draw(printedLine(), { target: m.slot });
        await flush();
        m.button("Undo")!.click();
        await flush();
        rec.finishAll();
        expect(m.store.discard).toHaveBeenCalledTimes(1);
        expect(m.slot.byClass("reader-ink-pagemark").filter((el) => el.isConnected)).toHaveLength(0);
    });
});

// ── #747: circle, arrow, scribble and lasso ─────────────────────────────────────────────────────

describe("circle, arrow, scribble and lasso (#747)", () => {
    let rec: AnimationRecord;
    beforeEach(() => {
        installBrowserGlobals();
        (globalThis as any).matchMedia = () => ({ matches: false });
        clock = 10_000;
        rec = recordAnimations();
        jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick", "queueMicrotask"] });
    });
    afterEach(() => {
        jest.useRealTimers();
        rec.stop();
        delete (globalThis as any).matchMedia;
    });

    type M = ReturnType<typeof direct>;
    type Rect = { left: number; top: number; right: number; bottom: number };
    /** The box of some words of the chapter, by their text, first match each. */
    const boxOf = (m: M, ...texts: string[]): Rect => {
        const ws = texts.map((text) => m.words.find((w) => m.text.slice(w.start, w.end) === text)!);
        return {
            left: Math.min(...ws.map((w) => w.left)),
            top: Math.min(...ws.map((w) => w.top)),
            right: Math.max(...ws.map((w) => w.left + w.width)),
            bottom: Math.max(...ws.map((w) => w.top + w.height)),
        };
    };
    /** A loop round a box, a little past where it began, as a hand closes one. */
    const around = (b: Rect, pad = 10, sweep = 2.08 * Math.PI) => {
        const cx = (b.left + b.right) / 2;
        const cy = (b.top + b.bottom) / 2;
        const rx = (b.right - b.left) / 2 + pad;
        const ry = (b.bottom - b.top) / 2 + pad / 2;
        return Array.from({ length: 49 }, (_, i) => ({ x: cx + rx * Math.cos(-Math.PI / 2 + (i / 48) * sweep), y: cy + ry * Math.sin(-Math.PI / 2 + (i / 48) * sweep) }));
    };
    const straight = (a: { x: number; y: number }, b: { x: number; y: number }, n = 24) => Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));
    /** An arrow drawn in one stroke, its barb back at 35° from the tip. */
    const arrow = (tail: { x: number; y: number }, tip: { x: number; y: number }) => {
        const back = Math.atan2(tail.y - tip.y, tail.x - tip.x) + (35 * Math.PI) / 180;
        return [...straight(tail, tip), ...straight(tip, { x: tip.x + 26 * Math.cos(back), y: tip.y + 26 * Math.sin(back) }, 6).slice(1)];
    };
    /** Back and forth over a box, nine times, drifting down it: a scratch-out. */
    const scratch = (b: Rect) => {
        const turns = Array.from({ length: 10 }, (_, k) => ({ x: k % 2 ? b.right + 6 : b.left - 6, y: b.top + 2 + ((b.bottom - b.top - 4) * k) / 9 }));
        return turns.flatMap((p, k) => (k === 0 ? [p] : straight(turns[k - 1], p, 8).slice(1)));
    };
    const centre = (b: Rect) => ({ x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 });
    /** A highlight made by selecting words: the ordinary way, with an idea. */
    const keep = async (m: M, exact: string) => {
        const at = m.text.indexOf(exact);
        const found = m.highlights.quoteFor(at, at + exact.length)!;
        const made = await m.highlights.keepSpan(found.span, found.quote, { origin: "selection" });
        m.highlights.hidePopover();
        return made!;
    };
    const inkStatus = (m: M) => m.root.oneByClass("reader-ink-status").textContent;
    const scrawl = (x: number, y: number) => [0, 1, 2, 3, 4, 5].map((k) => ({ x: x + k * 8, y: y + (k % 2 ? -6 : 6) }));

    describe("a circle keeps its words as a question (FR-3, AC-3)", () => {
        it("keeps the words inside it with the meaning Question — the thought a selection with Question makes", async () => {
            const m = direct({ textRects: true });
            await flush();
            m.draw(around(boxOf(m, "sourcing", "stores")));
            await flush();
            expect(m.store.write).toHaveBeenCalledTimes(1);
            const [note, circled] = m.store.write.mock.calls[0] as [string, any];
            expect(circled.quote.exact).toBe("sourcing stores");
            expect(circled.meaning).toBe("question");
            // The same words, selected, with Question: the same write, field for field.
            const at = m.text.indexOf("sourcing stores");
            const found = m.highlights.quoteFor(at, at + "sourcing stores".length)!;
            await m.highlights.keepSpan(found.span, found.quote, { meaning: "question", origin: "selection" });
            expect(m.store.write.mock.calls[1]).toEqual([note, circled]);
            wait(GROUP_IDLE_MS * 2);
            await flush();
            expect(m.store.writeInk).not.toHaveBeenCalled();
        });

        it("says so, with Undo and Keep as ink, and leaves the meaning H uses as it was", async () => {
            const m = direct({ textRects: true });
            await flush();
            m.draw(around(boxOf(m, "sourcing", "stores")));
            await flush();
            expect(m.status().textContent).toContain("Circled — kept as a question");
            expect(m.button("Keep as ink")).toBeDefined();
            expect(m.highlights.currentMeaning()).toBe("idea");
            m.button("Undo")!.click();
            await flush();
            expect(m.store.discard).toHaveBeenCalledWith(expect.objectContaining({ id: "hl1" }));
            expect(m.ink.undoKey()).toBe(false);
        });

        it("keeps the circle as ink instead: the highlight to the trash and the stroke written, in one batch (AC-7)", async () => {
            const m = direct({ textRects: true });
            await flush();
            m.draw(around(boxOf(m, "sourcing", "stores")));
            await flush();
            m.button("Keep as ink")!.click();
            await flush();
            expect(m.store.discard).toHaveBeenCalledTimes(1);
            expect(m.store.writeInk).toHaveBeenCalledTimes(1);
            expect(m.batches.writeInk[0]).toBe(m.batches.discard[0]);
            expect(m.marks()).toHaveLength(0);
        });

        it("is taken back by the palette's undo (FR-8)", async () => {
            const m = direct({ textRects: true });
            await flush();
            m.draw(around(boxOf(m, "sourcing", "stores")));
            await flush();
            m.root.oneByClass("reader-ink-undo").click();
            await flush();
            expect(m.store.discard).toHaveBeenCalledTimes(1);
        });

        it("stays ink round no words: a loop in the margin", async () => {
            const m = direct({ textRects: true });
            await flush();
            m.draw(around({ left: 600, top: 120, right: 700, bottom: 150 }));
            wait(GROUP_IDLE_MS);
            await flush();
            expect(m.store.write).not.toHaveBeenCalled();
            expect(m.store.writeInk).toHaveBeenCalledTimes(1);
        });

        it("tightens a clean ring onto its words as the question sweeps in, before the write answers (FR-12, FR-16)", async () => {
            const m = direct({ textRects: true, writePending: true });
            await flush();
            m.draw(around(boxOf(m, "sourcing", "stores")));
            const ring = rec.animations.find((a) => a.target.hasClass?.("zettelkasten-flow__reader-ink-ring"));
            expect(ring).toBeDefined();
            expect(ring!.duration).toBe(MOTION.base);
            expect(new Set(ring!.keyframes.flatMap((k) => Object.keys(k)))).toEqual(new Set(["opacity", "transform", "offset"]));
            expect(ring!.target.hasClass("zettelkasten-flow__reader-ink--hl-question")).toBe(true);
            expect(ring!.target.cssProps["--zf-ink-origin"]).toMatch(/px .*px$/);
            // The mark is already on the words, sweeping; the write is still out.
            expect(m.marks().length).toBeGreaterThan(0);
            for (const mark of m.marks()) {
                expect(mark.hasClass("zettelkasten-flow__reader-highlight--new")).toBe(true);
                expect(mark.hasClass("zettelkasten-flow__reader-highlight--question")).toBe(true);
            }
            m.release();
            await flush();
            rec.finishAll();
            expect(ring!.target.isConnected).toBe(false);
        });
    });

    describe("an arrow links two marks (FR-4, AC-4)", () => {
        it("links the two highlights it is drawn between, both ways, in one recorded write", async () => {
            const m = direct({ textRects: true });
            await flush();
            const a = await keep(m, "stores changes");
            const b = await keep(m, "it from");
            m.draw(arrow(centre(boxOf(m, "stores", "changes")), centre(boxOf(m, "it", "from"))));
            await flush();
            expect(m.store.save).toHaveBeenCalledTimes(2);
            const saved = m.store.save.mock.calls.map((call) => call[0] as Thought);
            expect(saved.find((t) => t.id === a.id)?.links).toEqual([{ to: b.id }]);
            expect(saved.find((t) => t.id === b.id)?.links).toEqual([{ to: a.id }]);
            expect(m.batches.save[0]).toBeDefined();
            expect(m.batches.save[1]).toBe(m.batches.save[0]);
            expect(m.status().textContent).toContain("Linked");
            expect(m.button("Keep as ink")).toBeDefined();
            wait(GROUP_IDLE_MS * 2);
            await flush();
            expect(m.store.writeInk).not.toHaveBeenCalled();
        });

        it("fades the arrow as the two marks brighten once: opacity only, gone at the end (FR-13)", async () => {
            const m = direct({ textRects: true });
            await flush();
            await keep(m, "stores changes");
            await keep(m, "it from");
            const before = rec.animations.length;
            m.draw(arrow(centre(boxOf(m, "stores", "changes")), centre(boxOf(m, "it", "from"))));
            const moved = rec.animations.slice(before);
            const fade = moved.find((a) => a.target.hasClass?.("zettelkasten-flow__reader-ink-live"));
            expect(fade?.keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }]);
            expect(fade?.duration).toBe(MOTION.base);
            const flashes = moved.filter((a) => a.target.hasClass?.("zettelkasten-flow__reader-ink-flash"));
            expect(flashes).toHaveLength(2);
            for (const f of flashes) expect(new Set(f.keyframes.flatMap((k) => Object.keys(k)).filter((k) => k !== "offset"))).toEqual(new Set(["opacity"]));
            rec.finishAll();
            expect(m.page.byClass("reader-ink-flash").filter((el) => el.isConnected)).toHaveLength(0);
            await flush();
        });

        it("stays ink when an end is on plain text, and says what it needs; no link is written", async () => {
            const m = direct({ textRects: true });
            await flush();
            await keep(m, "stores changes");
            m.draw(arrow(centre(boxOf(m, "stores", "changes")), centre(boxOf(m, "every", "change"))));
            await flush();
            expect(inkStatus(m)).toBe("Arrows link marks — highlight both ends first");
            wait(GROUP_IDLE_MS);
            await flush();
            expect(m.store.save).not.toHaveBeenCalled();
            expect(m.store.writeInk).toHaveBeenCalledTimes(1);
        });

        it("writes an ink note it ends on first, then links it (G3)", async () => {
            const m = direct({ textRects: true });
            await flush();
            const a = await keep(m, "stores changes");
            m.draw(scrawl(600, 170));
            clock += 300;
            m.draw(arrow(centre(boxOf(m, "stores", "changes")), { x: 615, y: 172 }));
            await flush();
            expect(m.store.writeInk).toHaveBeenCalledTimes(1);
            expect(m.store.save).toHaveBeenCalledTimes(2);
            const saved = m.store.save.mock.calls.map((call) => call[0] as Thought);
            const ink = saved.find((t) => t.id !== a.id)!;
            expect(ink.id).toMatch(/^ink/);
            expect(saved.find((t) => t.id === a.id)?.links).toEqual([{ to: ink.id }]);
        });

        it("keeps the arrow as ink instead: both saved without the link, and the stroke written (AC-7)", async () => {
            const m = direct({ textRects: true });
            await flush();
            await keep(m, "stores changes");
            await keep(m, "it from");
            m.draw(arrow(centre(boxOf(m, "stores", "changes")), centre(boxOf(m, "it", "from"))));
            await flush();
            m.button("Keep as ink")!.click();
            await flush();
            const saves = m.store.save.mock.calls.map((call) => call[0] as Thought);
            expect(saves).toHaveLength(4);
            expect(saves.slice(2).every((t) => t.links.length === 0)).toBe(true);
            expect(m.store.writeInk).toHaveBeenCalledTimes(1);
            expect(m.batches.writeInk[0]).toBe(m.batches.save[2]);
        });

        it("is taken back by the palette's undo: both saved as they were, in one batch", async () => {
            const m = direct({ textRects: true });
            await flush();
            await keep(m, "stores changes");
            await keep(m, "it from");
            m.draw(arrow(centre(boxOf(m, "stores", "changes")), centre(boxOf(m, "it", "from"))));
            await flush();
            m.root.oneByClass("reader-ink-undo").click();
            await flush();
            const saves = m.store.save.mock.calls.map((call) => call[0] as Thought);
            expect(saves).toHaveLength(4);
            expect(saves.slice(2).every((t) => t.links.length === 0)).toBe(true);
            expect(m.batches.save[3]).toBe(m.batches.save[2]);
            // Its line goes with it: no Undo is left offering what is already undone.
            expect(m.status()).toBeUndefined();
        });
    });

    describe("the way back stays true (review of #747)", () => {
        it("takes back only the arrow's link: a change made since stays", async () => {
            const m = direct({ textRects: true });
            await flush();
            const a = await keep(m, "stores changes");
            await keep(m, "it from");
            m.draw(arrow(centre(boxOf(m, "stores", "changes")), centre(boxOf(m, "it", "from"))));
            await flush();
            const linked = (m.store.save.mock.calls[0] as [Thought])[0];
            // The highlight's meaning changed after the arrow.
            m.highlights.adopt({ ...linked, meaning: "quote" });
            m.root.oneByClass("reader-ink-undo").click();
            await flush();
            const undone = m.store.save.mock.calls.slice(2).map((call) => call[0] as Thought);
            const back = undone.find((t) => t.id === a.id)!;
            expect(back.meaning).toBe("quote");
            expect(back.links).toEqual([]);
        });

        it("turns a shaft and its head into one arrow and one step: Undo takes the link, nothing is left dead", async () => {
            const m = direct({ textRects: true });
            await flush();
            await keep(m, "stores changes");
            await keep(m, "it from");
            const tail = centre(boxOf(m, "stores", "changes"));
            const tip = centre(boxOf(m, "it", "from"));
            m.draw(straight(tail, tip));
            clock += 300;
            const back = Math.atan2(tail.y - tip.y, tail.x - tip.x);
            const arm = (k: number) => ({ x: tip.x + 24 * Math.cos(back + k), y: tip.y + 24 * Math.sin(back + k) });
            m.draw([...straight(arm(0.6), tip, 6), ...straight(tip, arm(-0.6), 6).slice(1)]);
            await flush();
            expect(m.store.save).toHaveBeenCalledTimes(2);
            m.root.oneByClass("reader-ink-undo").click();
            await flush();
            expect(m.store.save).toHaveBeenCalledTimes(4);
            expect(m.ink.undoKey()).toBe(false);
            wait(GROUP_IDLE_MS * 2);
            await flush();
            expect(m.store.writeInk).not.toHaveBeenCalled();
        });

        it("never says Erased when the erase failed, and leaves nothing to undo", async () => {
            const error = jest.spyOn(log, "error").mockImplementation(() => undefined);
            const m = direct({ textRects: true });
            await flush();
            await keep(m, "stores changes");
            m.store.discard.mockImplementationOnce(async () => Promise.reject(new Error("locked")));
            m.draw(scratch(boxOf(m, "stores", "changes")));
            await flush();
            expect(m.status()?.textContent ?? "").not.toContain("Erased");
            expect(m.marks().length).toBeGreaterThan(0);
            expect(m.ink.undoKey()).toBe(false);
            error.mockRestore();
        });

        it("leaves a popover that is not its line alone when the palette's undo takes a gesture back", async () => {
            const m = direct({ textRects: true });
            await flush();
            m.draw(around(boxOf(m, "sourcing", "stores")));
            await flush();
            m.pick("lasso");
            m.draw(around(boxOf(m, "the", "state")));
            await flush();
            expect(m.root.byClass("reader-hl-pop--select")).toHaveLength(1);
            m.root.oneByClass("reader-ink-undo").click();
            await flush();
            expect(m.store.discard).toHaveBeenCalledTimes(1);
            expect(m.root.byClass("reader-hl-pop--select")).toHaveLength(1);
        });
    });

    describe("a scribble erases, and the eraser reaches highlights (FR-5, FR-6, AC-5)", () => {
        it("takes the ink stroke and the highlight it is drawn over, in one batch, and brings both back as one action", async () => {
            const m = direct({ textRects: true });
            await flush();
            const hl = await keep(m, "stores changes");
            // A tick of ink through the highlight, written.
            m.draw(straight({ x: 300, y: 96 }, { x: 302, y: 130 }, 8));
            wait(GROUP_IDLE_MS);
            await flush();
            expect(m.store.writeInk).toHaveBeenCalledTimes(1);
            m.draw(scratch(boxOf(m, "stores", "changes")));
            await flush();
            expect(m.store.discard).toHaveBeenCalledTimes(2);
            expect(m.store.discard).toHaveBeenCalledWith(expect.objectContaining({ id: hl.id }));
            expect(m.batches.discard[1]).toBe(m.batches.discard[0]);
            expect(m.marks()).toHaveLength(0);
            expect(m.status().textContent).toContain("Erased");
            m.button("Undo")!.click();
            await flush();
            expect(m.store.restore).toHaveBeenCalledTimes(2);
            expect(m.marks().length).toBeGreaterThan(0);
            // Nothing of the scribble is ever kept.
            wait(GROUP_IDLE_MS * 2);
            await flush();
            expect(m.store.writeInk).toHaveBeenCalledTimes(1);
        });

        it("fades the scribble and what it took together: opacity, 120 ms (FR-14)", async () => {
            const m = direct({ textRects: true });
            await flush();
            await keep(m, "stores changes");
            const before = rec.animations.length;
            m.draw(scratch(boxOf(m, "stores", "changes")));
            const moved = rec.animations.slice(before);
            expect(moved.length).toBeGreaterThanOrEqual(2);
            for (const a of moved) {
                expect(a.duration).toBe(MOTION.fast);
                expect(new Set(a.keyframes.flatMap((k) => Object.keys(k)))).toEqual(new Set(["opacity"]));
            }
            expect(moved.some((a) => a.target.hasClass?.("zettelkasten-flow__reader-ink-live"))).toBe(true);
            expect(moved.some((a) => a.target.hasClass?.("zettelkasten-flow__reader-hl-washout"))).toBe(true);
            await flush();
        });

        it("erases nothing over nothing, keeps no ink, and says so (the empty state)", async () => {
            const m = direct({ textRects: true });
            await flush();
            m.draw(scratch({ left: 620, top: 300, right: 700, bottom: 316 }));
            await flush();
            expect(inkStatus(m)).toBe("Nothing to erase");
            wait(GROUP_IDLE_MS * 2);
            await flush();
            expect(m.store.discard).not.toHaveBeenCalled();
            expect(m.store.writeInk).not.toHaveBeenCalled();
        });

        it("lets the eraser take a highlight it passes over, with Undo", async () => {
            const m = direct({ textRects: true });
            await flush();
            const hl = await keep(m, "it from");
            m.pick("eraser");
            const b = boxOf(m, "it", "from");
            m.draw(straight({ x: b.left + 4, y: b.top + 8 }, { x: b.right - 4, y: b.top + 8 }, 10));
            await flush();
            expect(m.store.discard).toHaveBeenCalledWith(expect.objectContaining({ id: hl.id }));
            m.root.oneByClass("reader-ink-undo").click();
            await flush();
            expect(m.store.restore).toHaveBeenCalledWith(expect.objectContaining({ id: hl.id }));
        });
    });

    describe("the lasso (FR-7, AC-6)", () => {
        it("opens the selection popover for exactly the words inside the loop, and writes nothing until you choose", async () => {
            const m = direct({ textRects: true });
            await flush();
            m.pick("lasso");
            m.draw(around(boxOf(m, "sourcing", "stores")));
            await flush();
            const pop = m.root.byClass("reader-hl-pop--select")[0];
            expect(pop).toBeDefined();
            expect(pop.byClass("reader-hl-meaning")).toHaveLength(4);
            expect(pop.find((el) => el.tag === "button" && el.textContent === "Copy")).toBeDefined();
            expect(m.store.write).not.toHaveBeenCalled();
            wait(GROUP_IDLE_MS * 2);
            await flush();
            expect(m.store.writeInk).not.toHaveBeenCalled();
            // The loop stays, dashed, while the popover is up.
            expect(m.page.byClass("reader-ink--lasso-closed").filter((el) => el.isConnected)).toHaveLength(1);
            pop.byClass("reader-hl-meaning").find((b) => b.getAttribute("data-meaning") === "quote")!.click();
            await flush();
            expect(m.store.write).toHaveBeenCalledTimes(1);
            const [, options] = m.store.write.mock.calls[0] as [string, any];
            expect(options.quote.exact).toBe("sourcing stores");
            expect(options.meaning).toBe("quote");
        });

        it("writes nothing when its popover is dismissed, and the loop fades with it (the negative)", async () => {
            const m = direct({ textRects: true });
            await flush();
            m.pick("lasso");
            m.draw(around(boxOf(m, "sourcing", "stores")));
            await flush();
            const before = rec.animations.length;
            m.highlights.hidePopover();
            const fade = rec.animations.slice(before).find((a) => a.target.hasClass?.("zettelkasten-flow__reader-ink--lasso-closed"));
            expect(fade?.keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }]);
            rec.finishAll();
            expect(m.page.byClass("reader-ink--lasso-closed").filter((el) => el.isConnected)).toHaveLength(0);
            expect(m.store.write).not.toHaveBeenCalled();
            expect(m.store.writeInk).not.toHaveBeenCalled();
        });

        it("offers Delete for the ink notes inside the loop", async () => {
            const m = direct({ textRects: true });
            await flush();
            m.draw(scrawl(600, 300));
            wait(GROUP_IDLE_MS);
            await flush();
            m.pick("lasso");
            m.draw(around({ left: 590, top: 285, right: 650, bottom: 315 }));
            await flush();
            expect(m.status().textContent).toContain("Ink notes in the loop");
            m.button("Delete ink")!.click();
            await flush();
            expect(m.store.discard).toHaveBeenCalledTimes(1);
            expect((m.store.discard.mock.calls[0] as [Thought])[0].id).toMatch(/^ink/);
            // The offer goes once it is taken, with its loop.
            expect(m.status()).toBeUndefined();
            rec.finishAll();
            expect(m.page.byClass("reader-ink--lasso-closed").filter((el) => el.isConnected)).toHaveLength(0);
        });

        it("says it caught nothing round an empty margin, and writes nothing (the empty state)", async () => {
            const m = direct({ textRects: true });
            await flush();
            m.pick("lasso");
            m.draw(around({ left: 600, top: 400, right: 700, bottom: 440 }));
            await flush();
            expect(inkStatus(m)).toBe("The lasso caught nothing");
            wait(GROUP_IDLE_MS * 2);
            await flush();
            expect(m.store.write).not.toHaveBeenCalled();
            expect(m.store.writeInk).not.toHaveBeenCalled();
        });
    });

    it("is all instant under reduced motion: no ring, no brightening, no fade (FR-17)", async () => {
        (globalThis as any).matchMedia = () => ({ matches: true });
        const m = direct({ textRects: true });
        await flush();
        await keep(m, "stores changes");
        await keep(m, "it from");
        m.draw(around(boxOf(m, "the", "state")));
        await flush();
        m.draw(arrow(centre(boxOf(m, "stores", "changes")), centre(boxOf(m, "it", "from"))));
        await flush();
        m.draw(scratch(boxOf(m, "it", "from")));
        await flush();
        expect(m.store.write).toHaveBeenCalledTimes(3);
        expect(m.store.save).toHaveBeenCalledTimes(2);
        expect(m.store.discard).toHaveBeenCalledTimes(1);
        expect(rec.animations).toHaveLength(0);
        expect(m.page.findAll((el) => el.hasClass("zettelkasten-flow__reader-ink-live") && el.isConnected)).toHaveLength(0);
    });
});
