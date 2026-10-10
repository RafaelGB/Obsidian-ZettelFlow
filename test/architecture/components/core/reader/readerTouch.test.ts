/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { MarkdownRenderer, TFile, WorkspaceLeaf } from "obsidian";
import { DomNode, flush, installBrowserGlobals } from "../../../../support/dashboardDom";
import { recordAnimations, type AnimationRecord } from "../../../../support/motionDom";
import { mouseClick, pointerDown, pointerMove, pointerUp, touchSwipe, touchTap } from "../../../../support/pointer";
import { withPlatform, IPAD } from "../../../../support/platform";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import { endChapterTurn } from "architecture/components/core/reader/readerTurn";
import { resetReaderWorkspace } from "architecture/components/core/reader/openReader";

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.extension = "md";
    return f;
}

const BODY = Array.from({ length: 6 }, (_, i) => `Paragraph ${i} of the chapter, with [[b]] in it.`).join("\n\n");

/** Every resize observer the view makes, so a test can say "the window changed shape". */
const observers: (() => void)[] = [];

function mount() {
    const files: Record<string, string> = { "a.md": BODY, "b.md": "The body of B.", "c.md": "The body of C." };
    const app = {
        workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), iterateAllLeaves: () => undefined, setActiveLeaf: jest.fn(), trigger: jest.fn() },
        vault: {
            getAbstractFileByPath: (path: string) => (files[path] !== undefined ? file(path) : null),
            cachedRead: async (f: TFile) => files[f.path],
        },
        metadataCache: { getFirstLinkpathDest: () => null, on: () => ({}) },
    };
    const content = new DomNode();
    const leaf = new WorkspaceLeaf(app, content) as unknown as WorkspaceLeaf & { detach: jest.Mock };
    leaf.detach = jest.fn();
    const view = new ReaderView(leaf, { settings: { readingMotion: { chapter: "stack" } }, saveSettings: jest.fn(async () => undefined) });
    return { view, app, content, leaf };
}

/** A reading of three notes, laid out as a 1000 × 800 stage with a long chapter on it. */
async function open(size = { width: 1000, height: 800 }) {
    const m = mount();
    await m.view.setState({ seed: "a.md", kind: "selection", paths: ["a.md", "b.md", "c.md"] }, {} as never);
    await m.view.onOpen();
    await flush();
    const root = m.content.oneByClass("reader") as any;
    const stage = m.content.oneByClass("reader-stage") as any;
    root.getBoundingClientRect = () => ({ left: 0, top: 0, ...size });
    stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: size.width, height: size.height - 100 });
    stage.clientHeight = 800;
    stage.scrollHeight = 4000;
    stage.scrollBy = jest.fn();
    const page = m.content.oneByClass("reader-page") as any;
    return { ...m, root, stage, page };
}

const count = (content: DomNode) => content.oneByClass("reader-count").textContent;
const reduced = (on: boolean) => ((globalThis as any).matchMedia = () => ({ matches: on }));

describe("tap the edges, swipe a chapter (#750 FR-1–FR-4, FR-17–FR-19)", () => {
    let rec: AnimationRecord;
    beforeEach(() => {
        installBrowserGlobals();
        observers.length = 0;
        (globalThis as any).ResizeObserver = class {
            constructor(cb: () => void) {
                observers.push(cb);
            }
            observe(): void {}
            disconnect(): void {}
        };
        (globalThis as any).innerWidth = 1000;
        // A turn that plays listens on its window for the key or click that ends it.
        (globalThis as any).addEventListener ??= () => undefined;
        (globalThis as any).removeEventListener ??= () => undefined;
        reduced(false);
        resetReaderWorkspace();
        MarkdownRenderer.calls = [];
        rec = recordAnimations();
    });
    afterEach(() => {
        endChapterTurn();
        rec.stop();
        delete (globalThis as any).matchMedia;
        delete (globalThis as any).innerWidth;
    });

    it("pages a screen on with a tap on the right edge, back on the left, and glides (AC-2, FR-19)", async () => {
        const { stage } = await open();
        touchTap(stage, { x: 900, y: 400 });
        expect(stage.scrollBy).toHaveBeenLastCalledWith({ top: 680, behavior: "smooth" });
        stage.scrollTop = 1000;
        touchTap(stage, { x: 100, y: 400 });
        expect(stage.scrollBy).toHaveBeenLastCalledWith({ top: -680, behavior: "smooth" });
        // A pen is a finger.
        touchTap(stage, { x: 950, y: 400 }, { type: "pen" });
        expect(stage.scrollBy).toHaveBeenCalledTimes(3);
    });

    it("is instant under reduced motion", async () => {
        reduced(true);
        const { stage } = await open();
        touchTap(stage, { x: 900, y: 400 });
        expect(stage.scrollBy).toHaveBeenLastCalledWith({ top: 680, behavior: "auto" });
    });

    it("shows the bar with a tap in the middle, and hides it with the next", async () => {
        const { stage, root } = await open();
        root.addClass("zettelkasten-flow__reader--idle");
        touchTap(stage, { x: 500, y: 400 });
        expect(root.hasClass("zettelkasten-flow__reader--idle")).toBe(false);
        touchTap(stage, { x: 500, y: 400 });
        expect(root.hasClass("zettelkasten-flow__reader--idle")).toBe(true);
        expect(stage.scrollBy).not.toHaveBeenCalled();
    });

    it("leaves a mouse alone: a click on the edge turns nothing (desktop is unchanged)", async () => {
        const { stage, root, content } = await open();
        root.addClass("zettelkasten-flow__reader--idle");
        const click = mouseClick(stage, { x: 900, y: 400 });
        mouseClick(stage, { x: 500, y: 400 });
        expect(stage.scrollBy).not.toHaveBeenCalled();
        expect(root.hasClass("zettelkasten-flow__reader--idle")).toBe(true);
        expect(click.defaultPrevented).toBe(false);
        expect(count(content)).toBe("01 / 03");
    });

    it("swallows the click a handled tap leaves behind, and nothing else", async () => {
        const { stage } = await open();
        expect(touchTap(stage, { x: 900, y: 400 }).defaultPrevented).toBe(true);
        expect(stage.fire("click", { target: stage }).defaultPrevented).toBe(false);
    });

    it("leaves a tap on a link to the link (FR-2)", async () => {
        const { stage, content } = await open();
        const link = content.oneByClass("reader-body").find((el) => el.tag === "a")!;
        const click = touchTap(stage, { x: 900, y: 400, target: link });
        expect(stage.scrollBy).not.toHaveBeenCalled();
        expect(click.defaultPrevented).toBe(false);
    });

    it("leaves a touch at the very edge of the screen to iPadOS and Obsidian (FR-3)", async () => {
        const { stage, content } = await open();
        touchTap(stage, { x: 10, y: 400 });
        touchSwipe(stage, { x: 10, y: 400 }, { x: 600, y: 400 });
        touchSwipe(stage, { x: 995, y: 400 }, { x: 400, y: 400 });
        await flush();
        expect(stage.scrollBy).not.toHaveBeenCalled();
        expect(count(content)).toBe("01 / 03");
        expect(rec.animations).toHaveLength(0);
        // Obsidian's own drawer swipe is told which touches are the page's.
        stage.fire("touchstart", { touches: [{ clientX: 500, clientY: 400 }] });
        expect(stage.getAttribute("data-ignore-swipe")).toBe("true");
        stage.fire("touchstart", { touches: [{ clientX: 8, clientY: 400 }] });
        expect(stage.getAttribute("data-ignore-swipe")).toBeNull();
    });

    it("turns to the next chapter when a swipe left is let go past a third (AC-3)", async () => {
        const { stage, content } = await open();
        touchSwipe(stage, { x: 800, y: 400 }, { x: 400, y: 410 });
        await flush();
        expect(count(content)).toBe("02 / 03");
        // The finger's turn was the chapter's: one sheet, playing out at the release speed.
        expect(content.byClass("turn-sheet")).toHaveLength(1);
        expect(rec.animations.every((a) => a.playState === "running" && a.playbackRate >= 1)).toBe(true);
    });

    it("holds the page under the finger, and springs back when let go short of a third", async () => {
        const { stage, content, page } = await open();
        touchSwipe(stage, { x: 800, y: 400 }, { x: 650, y: 405 }, { ms: 600, lift: false });
        expect(content.byClass("turn-sheet")).toHaveLength(1);
        expect(page.hasClass("zettelkasten-flow__reader-page--under-scrub")).toBe(true);
        const sheet = rec.animations[0];
        expect(sheet.playState).toBe("paused");
        expect(sheet.currentTime).toBeCloseTo((150 / 1000) * sheet.duration, 5);
        pointerUp(stage, { x: 650, y: 405 }, 300);
        expect(sheet.playbackRate).toBeLessThan(0);
        rec.finishAll();
        await flush();
        expect(count(content)).toBe("01 / 03");
        expect(content.byClass("turn-sheet")).toHaveLength(0);
        expect(page.hasClass("zettelkasten-flow__reader-page--under-scrub")).toBe(false);
    });

    it("resists at the first chapter: a third of the finger, then back, and no turn (FR-18)", async () => {
        const { stage, content } = await open();
        touchSwipe(stage, { x: 300, y: 400 }, { x: 600, y: 400 }, { lift: false });
        expect(stage.cssProps["--zf-scrub-x"]).toBe("100px");
        expect(stage.hasClass("zettelkasten-flow__reader-stage--rubber")).toBe(true);
        expect(content.byClass("turn-sheet")).toHaveLength(0);
        pointerUp(stage, { x: 600, y: 400 }, 10);
        await flush();
        expect(count(content)).toBe("01 / 03");
        expect(stage.cssProps["--zf-scrub-x"]).toBe("0px");
        expect(stage.hasClass("zettelkasten-flow__reader-stage--rubber")).toBe(false);
        const spring = rec.animations.find((a) => a.target === stage)!;
        expect(spring.keyframes).toEqual([{ transform: "translateX(100px)" }, { transform: "translateX(0px)" }]);
    });

    it("still follows the finger under reduced motion (AC-11)", async () => {
        reduced(true);
        const { stage, content } = await open();
        touchSwipe(stage, { x: 800, y: 400 }, { x: 600, y: 400 }, { lift: false });
        expect(rec.animations.length).toBeGreaterThan(0);
        expect(rec.animations.every((a) => (a.currentTime ?? 0) > 0)).toBe(true);
        pointerUp(stage, { x: 300, y: 400 }, 10);
        await flush();
        expect(count(content)).toBe("02 / 03");
    });

    it("lets a vertical drag scroll, as today — and a diagonal never turns (FR-4)", async () => {
        const { stage, content } = await open();
        pointerDown(stage, { x: 500, y: 400 });
        pointerMove(stage, { x: 512, y: 440 }, 40);
        pointerMove(stage, { x: 800, y: 450 }, 40);
        pointerUp(stage, { x: 900, y: 450 }, 40);
        await flush();
        expect(count(content)).toBe("01 / 03");
        expect(rec.animations).toHaveLength(0);
    });

    it("moves only what the compositor moves", async () => {
        const { stage } = await open();
        touchSwipe(stage, { x: 800, y: 400 }, { x: 400, y: 410 });
        await flush();
        for (const key of rec.keys()) expect(["transform", "opacity", "offset", "easing"]).toContain(key);
    });

    it("does not wake the bar for a finger's move, only for a mouse's", async () => {
        const { content, root } = await open();
        root.addClass("zettelkasten-flow__reader--idle");
        content.fire("pointermove", { pointerType: "touch" });
        expect(root.hasClass("zettelkasten-flow__reader--idle")).toBe(true);
        content.fire("pointermove", { pointerType: "mouse" });
        expect(root.hasClass("zettelkasten-flow__reader--idle")).toBe(false);
    });

    it("keeps the line you were reading through a rotation (FR-11)", async () => {
        const { stage, content, root } = await open();
        let height = 100;
        const paragraphs = content.oneByClass("reader-body").findAll((el) => el.tag === "p") as any[];
        paragraphs.forEach((p, i) => (p.getBoundingClientRect = () => ({ left: 0, top: i * height - stage.scrollTop, width: 600, height })));
        observers.forEach((fire) => fire());
        stage.scrollTop = 250;
        stage.fire("scroll");
        await new Promise((resolve) => setTimeout(resolve, 200));
        // Turned: the column is narrower, every block twice as tall.
        height = 200;
        root.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 1000 });
        observers.forEach((fire) => fire());
        expect(stage.scrollTop).toBe(500);
    });
});

describe("panels become a bottom sheet in portrait (#750 FR-7, FR-20, AC-5)", () => {
    beforeEach(() => {
        installBrowserGlobals();
        (globalThis as any).ResizeObserver = class {
            observe(): void {}
            disconnect(): void {}
        };
        reduced(false);
        resetReaderWorkspace();
    });
    afterEach(() => delete (globalThis as any).matchMedia);

    const contents = (content: DomNode) => content.byClass("reader-bar-button").find((b) => b.getAttribute("aria-label") === "Contents")!;
    const panel = (content: DomNode) => content.oneByClass("reader-panel") as any;
    const handle = (content: DomNode) => content.oneByClass("reader-sheet-handle") as any;
    const drag = (el: any, from: number, to: number, ms: number) => {
        el.fire("pointerdown", { pointerId: 1, clientY: from, timeStamp: 1000 });
        el.fire("pointermove", { pointerId: 1, clientY: to, timeStamp: 1000 + ms });
        el.fire("pointerup", { pointerId: 1, clientY: to, timeStamp: 1000 + ms });
    };

    it("opens as a sheet at half height, with a handle and the page dimmed, on an iPad in portrait", async () => {
        await withPlatform(IPAD, async () => {
            const { content } = await open({ width: 820, height: 1180 });
            contents(content).click();
            const host = panel(content);
            expect(host.hasClass("zettelkasten-flow__reader-panel--sheet")).toBe(true);
            expect(host.cssProps["--zf-sheet-full"]).toBe(`${Math.round(1180 * 0.92)}px`);
            expect(host.cssProps["--zf-sheet-y"]).toBe(`${Math.round(1180 * 0.92) - 590}px`);
            expect(handle(content).getAttribute("aria-label")).toBe("Drag to resize, or down to close");
            expect(content.byClass("reader-sheet-scrim")).toHaveLength(1);
            expect(content.byClass("reader-toc-row")).toHaveLength(3);
        });
    });

    it("settles nearly full when dragged up, and closes when dragged well down", async () => {
        await withPlatform(IPAD, async () => {
            const { content } = await open({ width: 820, height: 1180 });
            contents(content).click();
            drag(handle(content), 600, 250, 1000);
            expect(panel(content).cssProps["--zf-sheet-y"]).toBe("0px");
            drag(handle(content), 250, 950, 1500);
            await new Promise((resolve) => setTimeout(resolve, 450));
            expect(panel(content).hasClass("zettelkasten-flow__reader-panel--open")).toBe(false);
            expect(content.byClass("reader-sheet-scrim")).toHaveLength(0);
        });
    });

    it("closes with a tap on the page above it", async () => {
        await withPlatform(IPAD, async () => {
            const { content } = await open({ width: 820, height: 1180 });
            contents(content).click();
            content.oneByClass("reader-sheet-scrim").click();
            await new Promise((resolve) => setTimeout(resolve, 300));
            expect(panel(content).hasClass("zettelkasten-flow__reader-panel--open")).toBe(false);
        });
    });

    it("stays today's card in landscape, and on a desktop", async () => {
        await withPlatform(IPAD, async () => {
            const { content } = await open({ width: 1180, height: 820 });
            contents(content).click();
            expect(panel(content).hasClass("zettelkasten-flow__reader-panel--sheet")).toBe(false);
            expect(content.byClass("reader-sheet-scrim")).toHaveLength(0);
        });
        const desk = await open({ width: 820, height: 1180 });
        contents(desk.content).click();
        expect(panel(desk.content).hasClass("zettelkasten-flow__reader-panel--sheet")).toBe(false);
    });

    it("follows the finger under reduced motion, and closes at once", async () => {
        reduced(true);
        await withPlatform(IPAD, async () => {
            const { content } = await open({ width: 820, height: 1180 });
            contents(content).click();
            const h = handle(content);
            h.fire("pointerdown", { pointerId: 1, clientY: 600, timeStamp: 1000 });
            h.fire("pointermove", { pointerId: 1, clientY: 700, timeStamp: 2000 });
            expect(panel(content).cssProps["--zf-sheet-y"]).toBe(`${Math.round(1180 * 0.92) - 490}px`);
            h.fire("pointermove", { pointerId: 1, clientY: 1100, timeStamp: 3000 });
            h.fire("pointerup", { pointerId: 1, clientY: 1100, timeStamp: 3000 });
            expect(panel(content).hasClass("zettelkasten-flow__reader-panel--open")).toBe(false);
        });
    });
});
