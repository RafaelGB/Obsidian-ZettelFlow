import { describe, it, expect, jest, beforeAll, afterAll, beforeEach, afterEach } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { Notice, TFile, WorkspaceLeaf } from "obsidian";
import { DomNode, settle } from "../../../../support/dashboardDom";
import { parseXml } from "../../../../support/miniXml";
import { makeEpub } from "../../../../support/zipFixture";
import { press } from "../../../../support/readerKeys";
import { pointerDown, pointerMove, touchTap } from "../../../../support/pointer";
import { recordAnimations, reducedMotion } from "../../../../support/motionDom";
import { withPlatform, IPAD } from "../../../../support/platform";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import { DEEP_COVERS_APP, DEEP_HIDES_APP, DEEP_RETURNING, resetReaderWorkspace } from "architecture/components/core/reader/openReader";
import { escapeStep, isReadingKey, movedEnough, JITTER_PX } from "architecture/components/core/reader/readerDeep";
import type { HighlightStore } from "architecture/components/core/reader/readerHighlights";

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;
const proto = (DomNode as any).prototype;
const ROOT = join(__dirname, "..", "..", "..", "..", "..");

describe("deep reading: the pure rules (#764)", () => {
    it("knows the reading keys, which never bring the chrome back (FR-4)", () => {
        for (const key of [" ", "ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"]) expect({ key, reading: isReadingKey(key) }).toEqual({ key, reading: true });
        expect(isReadingKey(" ", { shift: true })).toBe(true);
        for (const key of ["H", "?", "B", "1", "F", "Escape"]) expect({ key, reading: isReadingKey(key) }).toEqual({ key, reading: false });
        expect(isReadingKey("F", { ctrl: true })).toBe(false);
        expect(isReadingKey("ArrowLeft", { alt: true })).toBe(false);
        expect(isReadingKey("ArrowRight", { meta: true })).toBe(false);
    });

    it("treats a few pixels as a jitter (FR-3)", () => {
        expect(JITTER_PX).toBe(4);
        expect(movedEnough(3, 2)).toBe(false);
        expect(movedEnough(5, 0)).toBe(true);
    });

    it("closes the nearest thing first, deep reading just before the Reader (AC-4)", () => {
        const all = { shortcuts: true, note: true, search: true, popover: true, peek: true, detour: true, panel: true, deep: true };
        const order: string[] = [];
        const open: Record<string, boolean> = { ...all };
        for (;;) {
            const step = escapeStep(open);
            order.push(step);
            if (step === "exit") break;
            open[step] = false;
        }
        expect(order).toEqual(["shortcuts", "note", "search", "popover", "peek", "detour", "panel", "deep", "exit"]);
        expect(escapeStep({ panel: true, deep: true })).toBe("panel");
        // A proposal card (#748) is nearer than anything: Esc dismisses it first, with no verdict.
        expect(escapeStep({ proposal: true, shortcuts: true, palette: true })).toBe("proposal");
        expect(escapeStep({ deep: true })).toBe("deep");
        expect(escapeStep({})).toBe("exit");
    });
});

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.name = path.split("/").pop() ?? path;
    f.extension = path.split(".").pop() ?? "";
    (f as any).stat = { size: 10, mtime: 20, ctime: 1 };
    return f;
}

const BOOK = makeEpub({
    title: "Deep",
    author: "A",
    chapters: [
        { id: "c1", href: "text/ch1.xhtml", title: "1 · One", body: "<p>Effort is what System 2 spends.</p>" },
        { id: "c2", href: "text/ch2.xhtml", title: "2 · Two", body: "<p>A law of least effort.</p>" },
    ],
});

/** The document the Reader is drawn in, with a window fullscreen it may ask for (or not). */
function fakeDoc(options: { enabled?: boolean; already?: boolean } = {}) {
    const doc = new DomNode("document") as any;
    doc.body = new DomNode("body");
    doc.fullscreenEnabled = options.enabled ?? true;
    doc.fullscreenElement = options.already ? doc.body : null;
    doc.body.requestFullscreen = jest.fn(async () => {
        doc.fullscreenElement = doc.body;
    });
    doc.exitFullscreen = jest.fn(async () => {
        doc.fullscreenElement = null;
    });
    return doc;
}

function mount(doc = fakeDoc(), focus = false) {
    const book = file("Books/deep.epub");
    const app = {
        workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), iterateAllLeaves: () => undefined, setActiveLeaf: jest.fn(), trigger: jest.fn() },
        vault: {
            getAbstractFileByPath: (path: string) => (path === book.path ? book : null),
            readBinary: async () => BOOK.buffer.slice(BOOK.byteOffset, BOOK.byteOffset + BOOK.byteLength),
            cachedRead: async () => "",
        },
        metadataCache: { getFirstLinkpathDest: () => null, on: () => ({}) },
    };
    const content = new DomNode();
    (content as any).doc = doc;
    const leaf = new WorkspaceLeaf(app, content) as unknown as WorkspaceLeaf & { detach: jest.Mock };
    leaf.detach = jest.fn();
    const host = { settings: { readerPrefs: { focus } } as Record<string, unknown>, saveSettings: jest.fn(async () => undefined) };
    const store: HighlightStore = {
        folder: () => "Lab",
        highlightsAbout: jest.fn(async () => []),
        write: jest.fn(async () => undefined),
        save: jest.fn(async () => undefined),
        discard: jest.fn(async () => undefined),
        restore: jest.fn(async () => undefined),
    };
    const view = new ReaderView(leaf, host, { store });
    return { view, content, leaf, doc, host };
}

async function open(doc = fakeDoc(), focus = false) {
    const m = mount(doc, focus);
    await m.view.setState({ source: "Books/deep.epub", chapter: 0 }, {} as never);
    await m.view.onOpen();
    await settle(() => m.content.byClass("reader-source-body").length > 0 || m.content.byClass("reader-missing").length > 0);
    const root = m.content.children[0];
    const stage = m.content.oneByClass("reader-stage");
    return { ...m, root, stage };
}

const DEEP = "zettelkasten-flow__reader--deep";
const IDLE = "zettelkasten-flow__reader--idle";
const ENTERING = "zettelkasten-flow__reader--deep-entering";
const button = (content: DomNode, label: string) => content.byClass("reader-bar-button").find((b) => b.getAttribute("aria-label") === label);
const deepButton = (content: DomNode) => content.byClass("reader-bar-button").find((b) => b.getAttribute("data-deep") === "true");
const key = (m: { view: unknown }, k: string, extra: Record<string, unknown> = {}) => press({ view: m.view } as any, k, extra);

describe("deep reading in the Reader (#764)", () => {
    let motion: () => void = () => undefined;
    beforeAll(() => {
        g.DOMParser = class {
            parseFromString(text: string) {
                return { ...parseXml(text), getElementsByTagName: () => [] };
            }
        };
        proto.appendText = function (this: DomNode, text: string) {
            this.createSpan({ text });
        };
    });
    afterAll(() => {
        delete g.DOMParser;
        delete proto.appendText;
    });
    beforeEach(() => {
        resetReaderWorkspace();
        motion = reducedMotion(true);
    });
    afterEach(() => {
        motion();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it("is the bar's one button where Fullscreen was, and F (AC-1, FR-1, FR-9)", async () => {
        const m = await open();
        expect(button(m.content, "Fullscreen")).toBeUndefined();
        const deep = button(m.content, "Deep reading")!;
        expect(deep).toBeDefined();
        expect(deep.getAttribute("aria-pressed")).toBe("false");
        deep.click();
        expect(m.root.hasClass(DEEP)).toBe(true);
        expect(deep.getAttribute("aria-label")).toBe("Leave deep reading");
        expect(deep.getAttribute("aria-pressed")).toBe("true");
        // The chrome's leave control leaves at once.
        deep.click();
        expect(m.root.hasClass(DEEP)).toBe(false);
        expect(key(m, "F").defaultPrevented).toBe(true);
        expect(m.root.hasClass(DEEP)).toBe(true);
        key(m, "F");
        expect(m.root.hasClass(DEEP)).toBe(false);
        key(m, "?");
        const labels = m.content.byClass("reader-shortcuts-label").map((el) => el.textContent);
        expect(labels).toContain("Deep reading");
        expect(labels).not.toContain("Fullscreen");
    });

    it("is not remembered: the view state says nothing about it (FR-8)", async () => {
        const m = await open();
        key(m, "F");
        expect(Object.keys(m.view.getState()).filter((k) => /deep|full/i.test(k))).toEqual([]);
    });

    it("leaves nothing but the page, and asks for the window's fullscreen where there is one (AC-2)", async () => {
        const m = await open();
        key(m, "F");
        expect(m.root.hasClass(DEEP)).toBe(true);
        expect(m.root.hasClass(IDLE)).toBe(true);
        expect(m.doc.body.requestFullscreen).toHaveBeenCalledTimes(1);
        await Promise.resolve();
        key(m, "F");
        expect(m.doc.exitFullscreen).toHaveBeenCalledTimes(1);
        expect(m.root.hasClass(DEEP)).toBe(false);
        expect(m.root.hasClass(IDLE)).toBe(false);
    });

    it("leaves a window that was already fullscreen exactly as it was", async () => {
        const m = await open(fakeDoc({ already: true }));
        key(m, "F");
        expect(m.doc.body.requestFullscreen).not.toHaveBeenCalled();
        key(m, "F");
        expect(m.doc.exitFullscreen).not.toHaveBeenCalled();
    });

    it("hides the chrome even where the window cannot go fullscreen", async () => {
        const m = await open(fakeDoc({ enabled: false }));
        expect(deepButton(m.content)).toBeDefined();
        expect(key(m, "F").defaultPrevented).toBe(true);
        expect(m.root.hasClass(DEEP)).toBe(true);
        expect(m.doc.body.requestFullscreen).not.toHaveBeenCalled();
    });

    it("asks nothing of the platform on an iPad: the Reader covers Obsidian's chrome instead", async () => {
        await withPlatform(IPAD, async () => {
            const m = await open();
            const deep = button(m.content, "Deep reading")!;
            expect(deep).toBeDefined();
            deep.click();
            expect(m.root.hasClass(DEEP)).toBe(true);
            expect(m.doc.body.requestFullscreen).not.toHaveBeenCalled();
        });
    });

    it("takes Obsidian's own chrome away on a desktop, and gives it back exactly (FR-2)", async () => {
        const m = await open();
        key(m, "F");
        expect([...m.doc.body.classes].sort()).toEqual([DEEP_COVERS_APP, DEEP_HIDES_APP].sort());
        key(m, "F");
        expect(m.doc.body.hasClass(DEEP_COVERS_APP)).toBe(false);
        expect(m.doc.body.hasClass(DEEP_HIDES_APP)).toBe(false);
        await new Promise((resolve) => setTimeout(resolve, 350));
        expect([...m.doc.body.classes]).toEqual([]);
    });

    it("slides Obsidian's chrome first, then covers, under motion", async () => {
        motion();
        motion = reducedMotion(false);
        const m = await open();
        jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick", "queueMicrotask"] });
        key(m, "F");
        expect(m.doc.body.hasClass(DEEP_HIDES_APP)).toBe(true);
        expect(m.doc.body.hasClass(DEEP_COVERS_APP)).toBe(false);
        jest.advanceTimersByTime(250);
        expect(m.doc.body.hasClass(DEEP_COVERS_APP)).toBe(true);
        key(m, "F");
        expect(m.doc.body.hasClass(DEEP_RETURNING)).toBe(true);
        jest.advanceTimersByTime(300);
        expect([...m.doc.body.classes]).toEqual([]);
    });

    it("moves the column inside the gesture as the leaf covers the window, and back, with no step (FR-10, §XVI)", async () => {
        motion();
        motion = reducedMotion(false);
        const rec = recordAnimations();
        const width = g.innerWidth;
        g.innerWidth = 1707;
        try {
            const m = await open();
            const page = m.content.oneByClass("reader-page") as any;
            // A desktop leaf beside the 44 px ribbon; covering, it spans the window.
            (m.stage as any).getBoundingClientRect = () => ({ left: 44, top: 40, width: 1663, height: 900, right: 1707, bottom: 940 });
            let travelled = 0;
            page.getBoundingClientRect = () => {
                const natural = m.doc.body.hasClass(DEEP_COVERS_APP) ? 0 : 22;
                const running = rec.animations.find((a) => a.target === page && a.playState === "running");
                return { left: natural + (running ? travelled : 0), top: 0, width: 768, height: 900 };
            };
            jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick", "queueMicrotask"] });
            key(m, "F");
            const going = rec.animations.filter((a) => a.target === page);
            expect(going).toHaveLength(1);
            expect(going[0].keyframes).toEqual([{ transform: "translateX(0px)" }, { transform: "translateX(-22px)" }]);
            expect(going[0].options).toMatchObject({ duration: 250, fill: "forwards" });
            // At the end of the gesture the column is at −22 px of its old place: exactly where the cover centres it.
            travelled = -22;
            jest.advanceTimersByTime(250);
            expect(m.doc.body.hasClass(DEEP_COVERS_APP)).toBe(true);
            expect(going[0].playState).toBe("idle");
            expect(rec.animations.filter((a) => a.target === page)).toHaveLength(1);
            // Leaving: the leaf gives the window back and the column travels back from where it is.
            key(m, "F");
            const back = rec.animations.filter((a) => a.target === page).at(-1)!;
            expect(back).not.toBe(going[0]);
            expect(back.keyframes).toEqual([{ transform: "translateX(-22px)" }, { transform: "translateX(0px)" }]);
            expect(back.options).toMatchObject({ duration: 250 });
            expect(rec.keys()).toEqual(new Set(["transform"]));
        } finally {
            g.innerWidth = width;
            rec.stop();
        }
    });

    it("re-centres the column at once under reduced motion: one change, no travel", async () => {
        const rec = recordAnimations();
        const width = g.innerWidth;
        g.innerWidth = 1707;
        try {
            const m = await open();
            (m.stage as any).getBoundingClientRect = () => ({ left: 44, top: 40, width: 1663, height: 900, right: 1707, bottom: 940 });
            key(m, "F");
            expect(m.doc.body.hasClass(DEEP_COVERS_APP)).toBe(true);
            key(m, "F");
            expect(rec.animations).toHaveLength(0);
        } finally {
            g.innerWidth = width;
            rec.stop();
        }
    });

    it("leaves deep reading when another tab takes the focus", async () => {
        const handlers: Record<string, (leaf: unknown) => void> = {};
        const m = mount();
        (m.view.app.workspace as any).on = (name: string, fn: (leaf: unknown) => void) => ((handlers[name] = fn), {});
        await m.view.setState({ source: "Books/deep.epub", chapter: 0 }, {} as never);
        await m.view.onOpen();
        await settle(() => m.content.byClass("reader-source-body").length > 0);
        key(m, "F");
        handlers["active-leaf-change"]({});
        expect(m.content.children[0].hasClass(DEEP)).toBe(false);
    });

    it("does not put back a fullscreen the window already left by itself (FR-6)", async () => {
        const m = await open();
        key(m, "F");
        await Promise.resolve();
        m.doc.fullscreenElement = null;
        m.doc.fire("fullscreenchange");
        // Deep reading stays: the platform took the window, not the page.
        expect(m.root.hasClass(DEEP)).toBe(true);
        key(m, "F");
        expect(m.doc.exitFullscreen).not.toHaveBeenCalled();
    });

    it("brings the chrome back past a jitter, a middle tap or a key that does not read (AC-3)", async () => {
        const m = await open();
        jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick", "queueMicrotask"] });
        key(m, "F");
        const move = (x: number) => m.content.fire("pointermove", { pointerType: "mouse", clientX: x, clientY: 100 });
        move(100);
        move(103);
        expect(m.root.hasClass(IDLE)).toBe(true);
        move(106);
        expect(m.root.hasClass(IDLE)).toBe(false);
        jest.advanceTimersByTime(2000);
        expect(m.root.hasClass(IDLE)).toBe(true);

        // Reading keys turn and stay quiet.
        key(m, " ");
        key(m, " ", { shiftKey: true });
        key(m, "ArrowDown");
        expect(m.root.hasClass(IDLE)).toBe(true);
        key(m, "H");
        expect(m.root.hasClass(IDLE)).toBe(false);
        jest.advanceTimersByTime(2000);
        key(m, "B");
        expect(m.root.hasClass(IDLE)).toBe(false);
        jest.advanceTimersByTime(2000);
        expect(m.root.hasClass(IDLE)).toBe(true);
    });

    it("keeps the chrome away on an edge tap, and brings it back on a middle tap (touch)", async () => {
        const m = await open();
        key(m, "F");
        (m.stage as any).getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800 });
        touchTap(m.stage, { x: 950, y: 400 });
        expect(m.root.hasClass(IDLE)).toBe(true);
        touchTap(m.stage, { x: 500, y: 400 });
        expect(m.root.hasClass(IDLE)).toBe(false);
    });

    it("stays while a panel or search is open over the page (FR-3, FR-5)", async () => {
        const m = await open();
        jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick", "queueMicrotask"] });
        key(m, "F");
        button(m.content, "Search in the book")!.click();
        expect(m.content.byClass("reader-search")).toHaveLength(1);
        expect(m.root.hasClass(DEEP)).toBe(true);
        jest.advanceTimersByTime(5000);
        expect(m.root.hasClass(IDLE)).toBe(false);
        key(m, "Escape");
        button(m.content, "Contents")!.click();
        jest.advanceTimersByTime(5000);
        expect(m.root.hasClass(IDLE)).toBe(false);
    });

    it("leaves one thing at a time with Esc: popover, search, panel, deep reading, then the Reader (AC-4)", async () => {
        const m = await open();
        key(m, "F");
        button(m.content, "Search in the book")!.click();
        button(m.content, "Contents")!.click();
        // A highlight popover is open over the page.
        const highlights = (m.view as any).highlights;
        let popover = true;
        jest.spyOn(highlights, "hasPopover").mockImplementation(() => popover);
        jest.spyOn(highlights, "hidePopover").mockImplementation(() => {
            popover = false;
        });
        const panelOpen = () => m.content.byClass("reader-panel--open").length > 0;
        expect(panelOpen()).toBe(true);
        key(m, "Escape");
        expect(m.content.byClass("reader-search")).toHaveLength(0);
        expect(popover).toBe(true);
        key(m, "Escape");
        expect(popover).toBe(false);
        expect(panelOpen()).toBe(true);
        key(m, "Escape");
        expect(panelOpen()).toBe(false);
        expect(m.root.hasClass(DEEP)).toBe(true);
        key(m, "Escape");
        expect(m.root.hasClass(DEEP)).toBe(false);
        expect(m.leaf.detach).not.toHaveBeenCalled();
        key(m, "Escape");
        await settle(() => m.leaf.detach.mock.calls.length > 0);
        expect(m.leaf.detach).toHaveBeenCalled();
    });

    it("leaves focus mode as it was, on or off, and saves nothing (AC-5)", async () => {
        for (const focus of [true, false]) {
            const m = await open(fakeDoc(), focus);
            const FOCUS = "zettelkasten-flow__reader--focus";
            expect(m.root.hasClass(FOCUS)).toBe(focus);
            key(m, "F");
            expect(m.root.hasClass(FOCUS)).toBe(focus);
            key(m, "F");
            expect(m.root.hasClass(FOCUS)).toBe(focus);
            expect(m.host.saveSettings).not.toHaveBeenCalled();
        }
    });

    it("says how to come back once, quietly, for two seconds — never a notice (AC-6)", async () => {
        const m = await open();
        const notice = jest.spyOn(Notice.prototype, "setMessage");
        jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick", "queueMicrotask"] });
        key(m, "F");
        const hints = m.content.byClass("reader-deep-hint");
        expect(hints).toHaveLength(1);
        expect(hints[0].getAttribute("role")).toBe("status");
        expect(hints[0].textContent).toBe("Move the pointer for the controls · Esc to leave");
        // Waking does not say it again.
        m.content.fire("pointermove", { pointerType: "mouse", clientX: 10, clientY: 10 });
        m.content.fire("pointermove", { pointerType: "mouse", clientX: 90, clientY: 10 });
        expect(m.content.byClass("reader-deep-hint")).toHaveLength(1);
        jest.advanceTimersByTime(2000);
        expect(m.content.byClass("reader-deep-hint")).toHaveLength(0);
        key(m, "H");
        expect(m.content.byClass("reader-deep-hint")).toHaveLength(0);
        // A finger on the page: the next entry says it for touch.
        key(m, "F");
        pointerDown(m.stage, { x: 500, y: 400 });
        key(m, "F");
        expect(m.content.oneByClass("reader-deep-hint").textContent).toBe("Tap the middle for the controls");
        expect(notice).not.toHaveBeenCalled();
        // Nothing in deep reading raises a notice: the hint is the page's own line.
        const src = readFileSync(join(ROOT, "src/architecture/components/core/reader/ReaderView.ts"), "utf8");
        const deep = src.slice(src.indexOf("// ── deep reading (#764)"), src.indexOf("/** Show the bar, then let it fade"));
        expect(deep.length).toBeGreaterThan(0);
        expect(deep).not.toContain("Notice");
    });

    it("says it for touch on an iPad before any finger lands", async () => {
        await withPlatform(IPAD, async () => {
            const m = await open();
            key(m, "F");
            expect(m.content.oneByClass("reader-deep-hint").textContent).toBe("Tap the middle for the controls");
        });
    });

    it("slides the chrome away in one gesture, then lets it go (FR-10)", async () => {
        motion();
        motion = reducedMotion(false);
        const m = await open();
        jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick", "queueMicrotask"] });
        key(m, "F");
        expect(m.root.hasClass(ENTERING)).toBe(true);
        jest.advanceTimersByTime(250);
        expect(m.root.hasClass(ENTERING)).toBe(false);
        key(m, "F");
        expect(m.root.hasClass("zettelkasten-flow__reader--deep-leaving")).toBe(true);
        jest.advanceTimersByTime(250);
        expect(m.root.hasClass("zettelkasten-flow__reader--deep-leaving")).toBe(false);
    });

    it("is instant under reduced motion (AC-7, FR-13)", async () => {
        const m = await open();
        key(m, "F");
        expect(m.root.hasClass(DEEP)).toBe(true);
        expect(m.root.hasClass(ENTERING)).toBe(false);
    });

    it("keeps its classes through a change of type (the root's classes are rebuilt)", async () => {
        const m = await open();
        key(m, "F");
        button(m.content, "Type")!.click();
        m.content.byClass("reader-type-option").find((b) => b.textContent === "Sepia")!.click();
        expect(m.root.hasClass(DEEP)).toBe(true);
    });

    it("gives the window back when the Reader closes in deep reading", async () => {
        const m = await open();
        key(m, "F");
        await Promise.resolve();
        await m.view.onClose();
        expect(m.doc.exitFullscreen).toHaveBeenCalledTimes(1);
    });
});

describe("deep reading's chrome moves on transform and opacity alone (#764 AC-7)", () => {
    const css = readFileSync(join(ROOT, "src/styles/components/reader.scss"), "utf8");
    const start = css.indexOf("/* ── deep reading (#764)");
    const block = css.slice(start, css.indexOf("/* ── end of deep reading */"));

    it("has its own block, in the shared beats", () => {
        expect(start).toBeGreaterThan(0);
        expect(block).toContain("$motion-base");
        expect(block).toContain("$motion-fast");
        expect(block).toContain("$motion-cover");
        for (const transition of block.matchAll(/transition:\s*([^;]+);/g)) {
            for (const part of transition[1].split(",")) expect(["transform", "opacity", "none"]).toContain(part.trim().split(/\s+/)[0]);
        }
    });

    it("hides every piece of chrome, the ribbon included, and never moves the page (FR-2, FR-14)", () => {
        for (const piece of ["reader-top", "reader-bar", "reader-dots", "reader-hairline", "reader-margin", "reader-detour-pill", "reader-ribbon"]) expect({ piece, hidden: block.includes(piece) }).toEqual({ piece, hidden: true });
        // Only transform, opacity, pointer events and the cursor change: no inset, no size, no padding.
        for (const prop of block.matchAll(/^\s*([a-z-]+)\s*:/gm)) {
            expect(["transform", "opacity", "pointer-events", "cursor", "transition", "animation", "position", "left", "bottom", "padding", "border-radius", "background-color", "color", "font-size", "z-index", "white-space", "max-width", "text-align", "border", "box-shadow"]).toContain(prop[1]);
        }
        expect(block).not.toMatch(/reader-(stage|page)\b[^{]*\{/);
    });

    it("has an instant equivalent under reduced motion (FR-13)", () => {
        const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
        for (const selector of ["reader--deep", "reader-deep-hint"]) expect({ selector, inReduced: reduced.includes(selector) }).toEqual({ selector, inReduced: true });
    });
});
