/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeAll, afterAll, beforeEach, afterEach } from "@jest/globals";
import { TFile, WorkspaceLeaf, __setPdfJs } from "obsidian";
import { DomNode, flush, settle } from "../../../../support/dashboardDom";
import { press } from "../../../../support/readerKeys";
import { makePdfJs, prose, type FakePage } from "../../../../support/fakePdf";
import { recordAnimations, reducedMotion, type AnimationRecord } from "../../../../support/motionDom";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import { resetReaderWorkspace } from "architecture/components/core/reader/openReader";
import { endChapterTurn } from "architecture/components/core/reader/readerTurn";
import { MOTION, flightTransform } from "architecture/components/core/reader/readerMotion";
import type { HighlightStore } from "architecture/components/core/reader/readerHighlights";

/**
 * **Page view, grown up** (#767), through the Reader with a fake pdf.js: the run of printed pages,
 * its zoom and its motion, the layouts it shares with the text, rotation, the *Pages* tab and the
 * links. The fake DOM has no layout: the stage is given a size, and the run sits at the top of the
 * stage's scrolled content, so what is "on screen" follows the scroll a test sets.
 */

const PATH = "Papers/cap.pdf";
const cls = (name: string) => `zettelkasten-flow__${name}`;
const VIEW = { width: 800, height: 600 };
const proto = DomNode.prototype as any;
const originalRect = proto.getBoundingClientRect;

function stageOf(node: DomNode): DomNode | null {
    for (let cur: DomNode | null = node; cur; cur = cur.parent) if (cur.classes.has(cls("reader-stage"))) return cur;
    return null;
}

beforeAll(() => {
    // The stage is the reading's size; the run starts at the top-left of what it scrolls.
    proto.getBoundingClientRect = function (this: DomNode) {
        if (this.classes.has(cls("reader-stage"))) return { left: 0, top: 0, width: VIEW.width, height: VIEW.height };
        if (this.classes.has(cls("reader-pv-run"))) {
            const stage = stageOf(this) as any;
            return { left: -(stage?.scrollLeft ?? 0), top: -(stage?.scrollTop ?? 0), width: 0, height: 0 };
        }
        return originalRect.call(this);
    };
    // A canvas that can be drawn on.
    proto.getContext = function () {
        return { drawImage: () => undefined };
    };
});

afterAll(() => {
    proto.getBoundingClientRect = originalRect;
    delete proto.getContext;
    __setPdfJs(null);
});

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.name = path.split("/").pop() ?? path;
    f.extension = path.split(".").pop() ?? "";
    (f as any).stat = { size: 10, mtime: 20, ctime: 1 };
    return f;
}

const text = (n: number) => ({ runs: prose([`Page ${n} says something about consistency in a network that divides,`, "and the replicas that must still answer."]) });

/** Eight pages; page 1 links to the references (page 8) and out to a DOI. */
function paper(extra: Partial<Record<number, Partial<FakePage>>> = {}): FakePage[] {
    return Array.from({ length: 8 }, (_, i) => ({
        ...text(i + 1),
        ...(i === 0
            ? {
                  links: [
                      { rect: [72, 600, 200, 620] as [number, number, number, number], dest: [{ num: 7 }, { name: "XYZ" }, 0, 396, 0] },
                      { rect: [72, 560, 300, 580] as [number, number, number, number], url: "https://doi.org/10.1145/564585.564601" },
                  ],
              }
            : {}),
        ...(extra[i] ?? {}),
    }));
}

function mount(pages: FakePage[] = paper(), settings: Record<string, any> = {}, options: { labels?: string[]; hold?: boolean } = {}) {
    const fake = makePdfJs({ pages, info: { Title: "A note on consistency" }, labels: options.labels ?? null, holdRenders: options.hold });
    __setPdfJs(fake.lib);
    const pdf = file(PATH);
    const vault = {
        getAbstractFileByPath: (path: string) => (path === pdf.path ? pdf : null),
        readBinary: async () => new ArrayBuffer(4),
        cachedRead: async () => "",
        modify: jest.fn(),
        modifyBinary: jest.fn(),
        create: jest.fn(),
        createBinary: jest.fn(),
        process: jest.fn(),
    };
    const app = {
        workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), iterateAllLeaves: () => undefined, setActiveLeaf: jest.fn(), trigger: jest.fn() },
        vault,
        metadataCache: { getFirstLinkpathDest: () => null, on: () => ({}) },
        fileManager: { processFrontMatter: jest.fn(), renameFile: jest.fn() },
    };
    const content = new DomNode();
    const leaf = new WorkspaceLeaf(app, content) as unknown as WorkspaceLeaf & { detach: jest.Mock };
    leaf.detach = jest.fn();
    const host = { settings: { readingMotion: { chapter: "stack" }, ...settings } as Record<string, any>, saveSettings: jest.fn(async () => undefined) };
    const store: HighlightStore = {
        folder: () => "Lab",
        highlightsAbout: jest.fn(async () => []),
        write: jest.fn(async () => undefined),
        save: jest.fn(async () => undefined),
        discard: jest.fn(async () => undefined),
        restore: jest.fn(async () => undefined),
    };
    const view = new ReaderView(leaf, host, { store });
    return { view, content, host, vault, app, calls: fake.calls, store };
}

async function open(chapter = 0, settings: Record<string, any> = {}, pages?: FakePage[], options: { labels?: string[]; hold?: boolean; layout?: string } = {}) {
    const m = mount(pages, settings, options);
    await m.view.setState({ source: PATH, chapter, ...(options.layout === "reading" ? {} : { layout: "page" }) }, {} as never);
    await m.view.onOpen();
    await settle(() => m.content.byClass("reader-next").length > 0);
    await flush();
    const stage = m.content.oneByClass("reader-stage") as any;
    return { ...m, stage };
}

/** Mod + a key, as Obsidian's keymap dispatches it to the view's scope. */
function pressMod(view: any, key: string): any {
    const evt: any = { key, defaultPrevented: false, preventDefault: () => (evt.defaultPrevented = true), stopPropagation: () => undefined, ctrlKey: true };
    const taken = view.scope.handleKey(evt, { modifiers: "Mod", key }) === false;
    if (taken) evt.preventDefault();
    return evt;
}

/** The live run — not a turning sheet's copy of it. */
const run = (content: DomNode) => content.oneByClass("reader-stage").oneByClass("reader-pv-run");
const slots = (content: DomNode) => run(content).byClass("reader-pv-slot");
const slotPages = (content: DomNode) => slots(content).map((slot) => Number(slot.getAttribute("data-page")));
const zoomButton = (content: DomNode) => content.oneByClass("reader-bar-zoom");
const barLabel = (content: DomNode) => content.oneByClass("reader-bar-label").textContent;
const wheel = (stage: any, deltaY: number, at = { x: 400, y: 300 }) => stage.fire("wheel", { deltaY, deltaMode: 0, ctrlKey: true, clientX: at.x, clientY: at.y, cancelable: true });
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const typePanel = (content: DomNode) => {
    content.byClass("reader-bar-button").find((el) => el.getAttribute("aria-label") === "Type")!.click();
};
const contents = (content: DomNode) => {
    content.byClass("reader-bar-button").find((el) => el.getAttribute("aria-label") === "Contents")!.click();
};

const g0 = globalThis as any;
// A chapter turn listens on its window for a key to skip it; node's global has no listeners of its own.
g0.addEventListener ??= () => undefined;
g0.removeEventListener ??= () => undefined;

describe("Page view opens at the width of the screen, and zooms (#767 FR-1, FR-2, AC-5)", () => {
    beforeEach(() => resetReaderWorkspace());

    it("draws the printed pages as a run, at Fit width, with the level in the bar", async () => {
        const { content, calls } = await open();
        expect(run(content).cssProps["--zf-run-w"]).toBe("800px");
        // The first page fills the width less the run's room; only what is near the screen is drawn.
        const first = slots(content).find((slot) => slot.getAttribute("data-page") === "0")!;
        expect(first.cssProps["--zf-slot-w"]).toBe("768px");
        // At 768 px wide the page is taller than the screen: it, and nothing else, is near.
        expect(slotPages(content)).toEqual([0]);
        expect(zoomButton(content).hasClass(cls("reader-hidden"))).toBe(false);
        expect(zoomButton(content).textContent).toBe("100%");
        await settle(() => calls.renders.length >= 1);
        expect(new Set(calls.renders.map((r) => r.page))).toEqual(new Set([1]));
    });

    it("follows a Ctrl+wheel at once and redraws nothing until it stops; then the pages on screen, sharp", async () => {
        const { content, stage, calls, host } = await open();
        await settle(() => calls.renders.length >= 1);
        const before = calls.renders.length;
        for (let i = 0; i < 5; i++) wheel(stage, -40);
        // During the gesture only the run's transform moves.
        expect(calls.renders.length).toBe(before);
        expect(Number(run(content).cssProps["--zf-run-scale"])).toBeGreaterThan(1.3);
        expect(run(content).hasClass(cls("reader-pv-run--zooming"))).toBe(true);
        await wait(160);
        await flush();
        // Settled: laid out at the new size in the same step the transform is cleared, then drawn again.
        expect(run(content).cssProps["--zf-run-scale"]).toBe("1");
        expect(Number(run(content).cssProps["--zf-run-w"].replace("px", ""))).toBeGreaterThan(800);
        await settle(() => calls.renders.length > before);
        const fresh = calls.renders.slice(before);
        expect(fresh.length).toBeGreaterThan(0);
        expect(fresh.every((r) => r.scale > calls.renders[0].scale)).toBe(true);
        expect(zoomButton(content).textContent).toMatch(/^1[4-6]\d%$/);
        // Kept with the paper, in plugin data.
        expect(host.settings.library[PATH].view.zoom).toBeGreaterThan(1.4);
    });

    it("zooms with Ctrl/⌘ + and −, and Ctrl/⌘ 0 is a camera move back to Fit width", async () => {
        const undo = reducedMotion(false);
        const record = recordAnimations();
        try {
            const { content, view } = await open();
            expect(pressMod(view, "=").defaultPrevented).toBe(true);
            expect(zoomButton(content).textContent).toBe("125%");
            pressMod(view, "+");
            expect(zoomButton(content).textContent).toBe("156%");
            pressMod(view, "-");
            expect(zoomButton(content).textContent).toBe("125%");
            record.animations.length = 0;
            pressMod(view, "0");
            expect(zoomButton(content).textContent).toBe("100%");
            const camera = record.animations.filter((a) => a.target === run(content));
            expect(camera).toHaveLength(1);
            expect(Object.keys(Object.assign({}, ...camera[0].keyframes)).sort()).toEqual(["scale", "translate"]);
            expect(camera[0].options.duration).toBe(MOTION.base);
            expect(camera[0].options.easing).toBe(MOTION.ease);
        } finally {
            record.stop();
            undo();
        }
    });

    it("springs back from past 400 %, on scale and translate alone", async () => {
        const undo = reducedMotion(false);
        const record = recordAnimations();
        try {
            const { content, stage } = await open();
            for (let i = 0; i < 40; i++) wheel(stage, -100);
            // Past the limit it still follows, resisting.
            expect(Number(run(content).cssProps["--zf-run-scale"])).toBeGreaterThan(4);
            record.animations.length = 0;
            await wait(160);
            expect(zoomButton(content).textContent).toBe("400%");
            const spring = record.animations.filter((a) => a.target === run(content));
            expect(spring).toHaveLength(1);
            expect(new Set(spring[0].keyframes.flatMap((frame) => Object.keys(frame)))).toEqual(new Set(["translate", "scale"]));
            expect(Number(spring[0].keyframes[0].scale)).toBeGreaterThan(1);
        } finally {
            record.stop();
            undo();
        }
    });

    it("takes the bar's level back to Fit width", async () => {
        const { content, view } = await open();
        pressMod(view, "=");
        expect(zoomButton(content).textContent).toBe("125%");
        zoomButton(content).click();
        expect(zoomButton(content).textContent).toBe("100%");
    });

    it("leaves Ctrl/⌘ + − 0 to Obsidian outside Page view", async () => {
        const { view, content } = await open(0, {}, undefined, { layout: "reading" });
        expect(content.byClass("reader-pv-run")).toHaveLength(0);
        expect(zoomButton(content).hasClass(cls("reader-hidden"))).toBe(true);
        expect(pressMod(view, "=").defaultPrevented).toBe(false);
        expect(pressMod(view, "0").defaultPrevented).toBe(false);
    });

    it("names the zoom keys in the shortcuts sheet", async () => {
        const { content } = await open();
        press(content as never, "?");
        expect(content.byClass("reader-shortcuts-label").map((el) => el.textContent)).toContain("Zoom in, out, or back to fit width");
    });
});

describe("pages arrive quietly, and scrolling is the platform's (#767 FR-19, FR-23, AC-9)", () => {
    beforeEach(() => resetReaderWorkspace());

    it("shows a blank sheet with its label until the page is drawn, then fades it in — once", async () => {
        const undo = reducedMotion(false);
        const record = recordAnimations();
        try {
            const { content, calls, view } = await open(0, {}, undefined, { hold: true, labels: ["i", "1", "2", "3", "4", "5", "6", "7"] });
            const first = slots(content).find((slot) => slot.getAttribute("data-page") === "0")!;
            expect(first.byClass("reader-pv-slot-label")[0].textContent).toBe("p. i");
            expect(first.byClass("reader-pv-canvas")).toHaveLength(0);
            calls.release();
            await settle(() => first.byClass("reader-pv-canvas").length === 1);
            const fades = record.animations.filter((a) => a.keyframes.some((frame) => "opacity" in frame) && a.options.duration === MOTION.fast);
            expect(fades.length).toBeGreaterThan(0);
            // Drawn again at another zoom: the sharper picture replaces the softer one, without a fade.
            record.animations.length = 0;
            pressMod(view, "=");
            for (let i = 0; i < 4; i++) {
                calls.release();
                await flush();
            }
            expect(record.animations.some((a) => a.keyframes.some((frame) => "opacity" in frame) && a.options.duration === MOTION.fast)).toBe(false);
        } finally {
            record.stop();
            undo();
        }
    });

    it("scrolls natively: no animation, and the bar follows the page most on screen", async () => {
        const undo = reducedMotion(false);
        const record = recordAnimations();
        try {
            const { content, stage } = await open();
            record.animations.length = 0;
            const height = Number(slots(content)[0].cssProps["--zf-slot-h"].replace("px", ""));
            stage.scrollTop = 16 + 2 * (height + 16) + 10;
            stage.fire("scroll");
            await wait(40);
            expect(record.animations.filter((a) => a.target === run(content))).toHaveLength(0);
            expect(barLabel(content)).toBe("Chapter 3 / 8");
            expect(slotPages(content)).toContain(2);
            // Only what is near is drawn: never the whole paper.
            expect(slots(content).length).toBeLessThanOrEqual(7);
        } finally {
            record.stop();
            undo();
        }
    });

    it("under reduced motion moves nothing, but a pinch still follows the fingers", async () => {
        const undo = reducedMotion(true);
        const record = recordAnimations();
        try {
            const { content, view, stage } = await open();
            pressMod(view, "=");
            pressMod(view, "0");
            const touch = (x1: number, x2: number) => ({ touches: [{ clientX: x1, clientY: 300 }, { clientX: x2, clientY: 300 }], cancelable: true });
            stage.fire("touchstart", touch(350, 450));
            stage.fire("touchmove", touch(300, 500));
            stage.fire("touchmove", touch(250, 550));
            expect(Number(run(content).cssProps["--zf-run-scale"])).toBeGreaterThan(1.5);
            stage.fire("touchend", { touches: [] });
            expect(record.animations).toHaveLength(0);
            expect(zoomButton(content).textContent).not.toBe("100%");
        } finally {
            record.stop();
            undo();
        }
    });
});

describe("the same Layout control, read for a printed page (#767 FR-6, FR-7, FR-13)", () => {
    beforeEach(() => resetReaderWorkspace());
    afterEach(() => {
        VIEW.width = 800;
        VIEW.height = 600;
        endChapterTurn();
    });

    it("shows Page view's group only in Page view, under the Layout row", async () => {
        const { content } = await open();
        typePanel(content);
        const labels = content.byClass("reader-type-label").map((el) => el.textContent);
        expect(content.oneByClass("reader-type-section").textContent).toBe("Page view");
        expect(labels.slice(0, 4)).toEqual(["Layout", "Fit", "Zoom", "Direction"]);
        expect(content.byText("Rotate page")).toBeDefined();
        expect(content.oneByClass("reader-pv-zoom-level").textContent).toBe("100%");
    });

    it("has no Page view group in the reading view", async () => {
        const { content } = await open(0, {}, undefined, { layout: "reading" });
        typePanel(content);
        expect(content.byClass("reader-type-section")).toHaveLength(0);
        expect(content.byText("Rotate page")).toBeUndefined();
    });

    it("runs the pages across, and a plain wheel scrolls sideways", async () => {
        const { content, stage, host } = await open();
        typePanel(content);
        content.byClass("reader-type-option").find((el) => el.textContent === "Across")!.click();
        const ys = new Set(slots(content).map((slot) => slot.cssProps["--zf-slot-y"]));
        expect(ys.size).toBe(1);
        const xs = slots(content).map((slot) => Number(slot.cssProps["--zf-slot-x"].replace("px", "")));
        expect(xs[1]).toBeGreaterThan(xs[0]);
        stage.scrollLeft = 0;
        const evt = stage.fire("wheel", { deltaY: 120, deltaX: 0, deltaMode: 0, cancelable: true });
        expect(evt.defaultPrevented).toBe(true);
        expect(stage.scrollLeft).toBe(120);
        expect(host.settings.library[PATH].view.across).toBe(true);
    });

    it("shows one page in Page, and turns with the chapter's own motion", async () => {
        const record = recordAnimations();
        const undo = reducedMotion(false);
        try {
            const { content } = await open(0, { readerPrefs: { layout: "page" } });
            expect(slotPages(content)).toEqual([0]);
            press(content as never, "ArrowRight");
            await settle(() => slotPages(content).join() === "1");
            expect(slotPages(content)).toEqual([1]);
            expect(content.byClass("turn-sheet").length).toBeGreaterThan(0);
            expect(barLabel(content)).toBe("Chapter 2 / 8");
        } finally {
            record.stop();
            undo();
        }
    });

    it("opens a spread on page 1 alone, on the right, then pairs; one page where there is no room", async () => {
        VIEW.width = 1400;
        VIEW.height = 900;
        const { content } = await open(0, { readerPrefs: { layout: "spread" } });
        expect(slotPages(content)).toEqual([0]);
        const width = Number(run(content).cssProps["--zf-run-w"].replace("px", ""));
        expect(Number(slots(content)[0].cssProps["--zf-slot-x"].replace("px", ""))).toBeGreaterThanOrEqual(width / 2);
        press(content as never, "ArrowRight");
        await settle(() => slotPages(content).join() === "1,2");
        expect(slotPages(content)).toEqual([1, 2]);
        press(content as never, "ArrowRight");
        await settle(() => slotPages(content).join() === "3,4");
        expect(slotPages(content)).toEqual([3, 4]);
        // Taller than wide: the spread steps back to one page a view.
        VIEW.width = 820;
        VIEW.height = 1180;
        press(content as never, "ArrowRight");
        await settle(() => slotPages(content).join() === "4");
        expect(slotPages(content)).toEqual([4]);
    });
});

describe("a page turns, and is kept turned with the paper — never in it (#767 FR-9, FR-21, AC-4)", () => {
    beforeEach(() => resetReaderWorkspace());

    it("turns the page a quarter, then draws it upright; the PDF and the vault are never written", async () => {
        const undo = reducedMotion(false);
        const record = recordAnimations();
        try {
            const { content, calls, host, vault, app, store } = await open();
            await settle(() => calls.renders.length >= 1);
            typePanel(content);
            content.byText("Rotate page")!.parent!.click();
            const turn = record.animations.find((a) => a.keyframes.some((frame) => "rotate" in frame));
            expect(turn).toBeDefined();
            // A quarter turn into its new place: transform's own parts, nothing laid out.
            expect(new Set(turn!.keyframes.flatMap((frame) => Object.keys(frame)))).toEqual(new Set(["translate", "rotate", "scale"]));
            expect(turn!.keyframes[0].rotate).toBe("-90deg");
            expect(turn!.options.duration).toBe(MOTION.base);
            await settle(() => calls.renders.some((r) => r.page === 1 && r.rotation === 90));
            expect(calls.renders.some((r) => r.page === 1 && r.rotation === 90)).toBe(true);
            // The page is now wider than tall.
            const first = slots(content).find((slot) => slot.getAttribute("data-page") === "0")!;
            expect(Number(first.cssProps["--zf-slot-w"].replace("px", ""))).toBeGreaterThan(Number(first.cssProps["--zf-slot-h"].replace("px", "")));
            expect(host.settings.library[PATH].view.rotate).toEqual({ 0: 90 });
            for (const write of [vault.modify, vault.modifyBinary, vault.create, vault.createBinary, vault.process, app.fileManager.processFrontMatter, app.fileManager.renameFile, store.write]) {
                expect(write).not.toHaveBeenCalled();
            }
        } finally {
            record.stop();
            undo();
        }
    });

    it("opens a paper again at its zoom and with its pages turned", async () => {
        const settings = { library: { [PATH]: { size: 10, mtime: 20, chapters: 8, chapter: 0, view: { zoom: 1.5, rotate: { 0: 90 } } } } };
        const { content, calls } = await open(0, settings);
        expect(zoomButton(content).textContent).toBe("150%");
        await settle(() => calls.renders.length > 0);
        expect(calls.renders.find((r) => r.page === 1)?.rotation).toBe(90);
    });

    it("reads a malformed stored view as Fit width", async () => {
        const settings = { library: { [PATH]: { size: 10, mtime: 20, chapters: 8, view: { zoom: "x", rotate: { 3: 45 } } } } };
        const { content } = await open(0, settings);
        expect(zoomButton(content).textContent).toBe("100%");
    });
});

describe("the Pages tab (#767 FR-10, FR-22, AC-6)", () => {
    beforeEach(() => resetReaderWorkspace());
    const g = globalThis as any;
    let observed: any[] = [];
    let hadObserver = false;
    beforeEach(() => {
        observed = [];
        hadObserver = "IntersectionObserver" in g;
        g.IntersectionObserver = class {
            constructor(public callback: (entries: any[]) => void) {
                observed.push(this);
            }
            targets: any[] = [];
            observe(el: any) {
                this.targets.push(el);
            }
            disconnect() {}
        };
    });
    afterEach(() => {
        if (!hadObserver) delete g.IntersectionObserver;
    });

    it("lists every page with its label, marks the current one, and draws a picture only once it is seen", async () => {
        const { content, calls } = await open(2, {}, undefined, { labels: ["i", "1", "2", "3", "4", "5", "6", "7"] });
        contents(content);
        content.byClass("reader-tab").find((el) => el.textContent === "Pages")!.click();
        const thumbs = content.byClass("reader-pv-thumb");
        expect(thumbs.map((el) => el.byClass("reader-pv-thumb-label")[0].textContent)).toEqual(["p. i", "p. 1", "p. 2", "p. 3", "p. 4", "p. 5", "p. 6", "p. 7"]);
        expect(thumbs[2].hasClass("is-active")).toBe(true);
        expect(thumbs.filter((el) => el.hasClass("is-active"))).toHaveLength(1);
        await settle(() => calls.renders.length >= 1);
        const before = calls.renders.length;
        // Only the thumbnails that come into view are drawn.
        const observer = observed[observed.length - 1];
        observer.callback([{ target: thumbs[6], isIntersecting: true }]);
        await settle(() => calls.renders.length > before);
        expect(calls.renders.slice(before).map((r) => r.page)).toEqual([7]);
    });

    it("flies a thumbnail to its page, which becomes the page; and leaves a place on the trail", async () => {
        const undo = reducedMotion(false);
        const record = recordAnimations();
        try {
            const { content } = await open(0);
            contents(content);
            content.byClass("reader-tab").find((el) => el.textContent === "Pages")!.click();
            const thumb = content.byClass("reader-pv-thumb")[5];
            thumb.click();
            expect(barLabel(content)).toBe("Chapter 6 / 8");
            const ghost = record.animations.find((a) => a.target.classes?.has(cls("motion-ghost")));
            expect(ghost).toBeDefined();
            expect(ghost!.options.duration).toBe(MOTION.cover);
            const slot = slots(content).find((el) => el.getAttribute("data-page") === "5")!;
            const box = (el: DomNode) => {
                const r = el.getBoundingClientRect();
                return { left: r.left, top: r.top, width: r.width, height: r.height };
            };
            expect(ghost!.keyframes[ghost!.keyframes.length - 1].transform).toBe(flightTransform(box(thumb.byClass("reader-pv-thumb-sheet")[0]), box(slot)));
            content.byClass("reader-tab").find((el) => el.textContent === "Where you've been")!.click();
            expect(content.byClass("reader-trail-row")).toHaveLength(1);
        } finally {
            record.stop();
            undo();
        }
    });

    it("under reduced motion the page is simply there, with no ghost", async () => {
        const undo = reducedMotion(true);
        const record = recordAnimations();
        try {
            const { content } = await open(0);
            contents(content);
            content.byClass("reader-tab").find((el) => el.textContent === "Pages")!.click();
            content.byClass("reader-pv-thumb")[4].click();
            expect(barLabel(content)).toBe("Chapter 5 / 8");
            expect(record.animations).toHaveLength(0);
        } finally {
            record.stop();
            undo();
        }
    });

    it("is Page view's only: the reading view's Contents has no Pages tab", async () => {
        const { content } = await open(0, {}, undefined, { layout: "reading" });
        contents(content);
        expect(content.byClass("reader-tab").map((el) => el.textContent)).toEqual(["Contents", "Bookmarks", "Where you've been"]);
    });
});

describe("links in the paper (#767 FR-11, FR-12, AC-7)", () => {
    beforeEach(() => resetReaderWorkspace());
    const g = globalThis as any;

    it("jumps to a place in the paper with the back pill, and Alt+← comes back", async () => {
        const { content, calls } = await open(0);
        await settle(() => content.byClass("reader-pv-link").length === 2);
        expect(calls.renders.length).toBeGreaterThan(0);
        const inside = content.byClass("reader-pv-link").find((el) => !el.hasClass(cls("reader-pv-link--out")))!;
        // Placed over the link, as shares of its page.
        expect(inside.cssProps["--zf-link-x"]).toBe(`${((72 / 612) * 100).toFixed(3)}%`);
        inside.click();
        await settle(() => barLabel(content) === "Chapter 8 / 8");
        expect(barLabel(content)).toBe("Chapter 8 / 8");
        const pill = content.oneByClass("reader-detour-pill");
        expect(pill.hasClass(cls("reader-hidden"))).toBe(false);
        expect(pill.textContent).toContain("p. 1");
        press(content as never, "ArrowLeft", { altKey: true });
        await settle(() => barLabel(content) === "Chapter 1 / 8");
        expect(barLabel(content)).toBe("Chapter 1 / 8");
    });

    it("keeps a page's links when it comes back on screen, drawn from what was kept (walk)", async () => {
        const { content, stage } = await open(0);
        await settle(() => content.byClass("reader-pv-link").length === 2);
        const height = Number(slots(content)[0].cssProps["--zf-slot-h"].replace("px", ""));
        stage.scrollTop = 16 + 2 * (height + 16);
        stage.fire("scroll");
        await wait(40);
        expect(slotPages(content)).not.toContain(0);
        stage.scrollTop = 0;
        stage.fire("scroll");
        await wait(40);
        await settle(() => content.byClass("reader-pv-link").length === 2);
        expect(content.byClass("reader-pv-link")).toHaveLength(2);
    });

    it("shows a link out of the paper with Copy link, and never follows it", async () => {
        const open_ = jest.fn();
        const writeText = jest.fn(async () => undefined);
        const hadNavigator = Object.getOwnPropertyDescriptor(g, "navigator");
        const hadOpen = g.open;
        Object.defineProperty(g, "navigator", { value: { clipboard: { writeText } }, configurable: true });
        g.open = open_;
        try {
            const { content, app } = await open(0);
            await settle(() => content.byClass("reader-pv-link--out").length === 1);
            content.oneByClass("reader-pv-link--out").click();
            const pop = content.oneByClass("reader-pv-outlink");
            expect(pop.oneByClass("reader-pv-outlink-url").textContent).toBe("https://doi.org/10.1145/564585.564601");
            expect(pop.oneByClass("reader-pv-outlink-says").textContent).toBe("This link leaves the paper");
            const copy = pop.oneByClass("reader-note-pop-go");
            expect(copy.textContent).toBe("Copy link");
            copy.click();
            await flush();
            expect(writeText).toHaveBeenCalledWith("https://doi.org/10.1145/564585.564601");
            expect(copy.textContent).toBe("Link copied");
            expect(open_).not.toHaveBeenCalled();
            expect(app.workspace.openLinkText).not.toHaveBeenCalled();
            // Esc puts it away.
            press(content as never, "Escape");
            expect(content.byClass("reader-pv-outlink")).toHaveLength(0);
        } finally {
            if (hadNavigator) Object.defineProperty(g, "navigator", hadNavigator);
            else delete g.navigator;
            g.open = hadOpen;
        }
    });

    it("reads a scan in Page view: zoom and pages work, no links, the banner unchanged", async () => {
        const scan = Array.from({ length: 3 }, () => ({ runs: [] }));
        const settings = { library: { [PATH]: { size: 10, mtime: 20, chapters: 3, imageOnly: true } } };
        const { content, view, calls } = await open(0, settings, scan, { layout: "reading" });
        expect(content.byClass("reader-pv-run")).toHaveLength(1);
        expect(content.oneByClass("reader-source-banner-text").textContent).toContain("This PDF is made of images");
        await settle(() => calls.renders.length > 0);
        await flush();
        expect(content.byClass("reader-pv-link")).toHaveLength(0);
        pressMod(view, "=");
        expect(zoomButton(content).textContent).toBe("125%");
    });
});
