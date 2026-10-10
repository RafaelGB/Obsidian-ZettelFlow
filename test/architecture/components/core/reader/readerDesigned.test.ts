/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeAll, afterAll, beforeEach, afterEach } from "@jest/globals";
import { TFile, WorkspaceLeaf } from "obsidian";
import { DomNode, flush, settle } from "../../../../support/dashboardDom";
import { press } from "../../../../support/readerKeys";
import { makeEpub, type FixtureChapter } from "../../../../support/zipFixture";
import { parseXml } from "../../../../support/miniXml";
import { withTextNodes } from "../../../../support/domText";
import { recordAnimations, reducedMotion, type AnimationRecord } from "../../../../support/motionDom";
import { FakeFontFace, FakeSheet, everyNode, installDesignedPlatform, type DesignedPlatform } from "../../../../support/designedDom";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import { resetReaderWorkspace } from "architecture/components/core/reader/openReader";
import { log } from "architecture";
import type { HighlightStore } from "architecture/components/core/reader/readerHighlights";

/**
 * **A fixed-layout book in the Reader** (#771): a comic's pages, drawn as they were made, each in its
 * own shadow root, read through #767's run of pages — the zoom, *Page*, *Spread* and *Scroll* are that
 * run's. The fake DOM has no layout: the stage is given a size, as in Page view's tests.
 */

const PATH = "Books/comic.epub";
const cls = (name: string) => `zettelkasten-flow__${name}`;
const VIEW = { width: 800, height: 600 };
const proto = DomNode.prototype as any;
const g = globalThis as any;
const originalRect = proto.getBoundingClientRect;

function stageOf(node: DomNode): DomNode | null {
    for (let cur: DomNode | null = node; cur; cur = cur.parent) if (cur.classes.has(cls("reader-stage"))) return cur;
    return null;
}

const PAGE_CSS =
    '@import url(https://example.com/a.css); @font-face{font-family:"Comic";src:url(../fonts/comic.woff2)} @font-face{font-family:Inter;src:url(https://fonts.example/i.woff2)}' +
    " .balloon{position:fixed;left:40px;font-family:Comic;background:url(../img/panel.png)} p{background:url(https://example.com/p.png);color:#222} :host{display:none} body{margin:0}";
const viewport = '<meta name="viewport" content="width=600, height=800"/><link rel="stylesheet" href="../css/page.css"/>';

function pages(count: number, extra: (i: number) => Partial<FixtureChapter> = () => ({})): FixtureChapter[] {
    return Array.from({ length: count }, (_, i) => ({
        id: `p${i + 1}`,
        href: `pages/p${i + 1}.xhtml`,
        head: viewport,
        body: `<div class="balloon" style="top:${10 + i}px">Panel ${i + 1}</div><img src="../img/panel.png" alt=""/><p onclick="x()">Page ${i + 1}</p><script>window.pwned = 1</script>`,
        ...(i === 0 ? { properties: "page-spread-right" } : {}),
        ...extra(i),
    }));
}

function comic(options: { count?: number; direction?: "ltr" | "rtl"; broken?: number; extra?: (i: number) => Partial<FixtureChapter> } = {}): Uint8Array {
    const count = options.count ?? 5;
    return makeEpub({
        title: "A Small Comic",
        author: "Someone",
        metadata: '<meta property="rendition:layout">pre-paginated</meta>',
        ...(options.direction ? { direction: options.direction } : {}),
        chapters: pages(count, (i) => ({ ...(options.extra?.(i) ?? {}), ...(i === options.broken ? { raw: "" } : {}) })),
        extra: {
            "OEBPS/css/page.css": PAGE_CSS,
            "OEBPS/img/panel.png": new Uint8Array([137, 80, 78, 71]),
            "OEBPS/fonts/comic.woff2": new Uint8Array([119, 79, 70, 50]),
        },
    });
}

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.name = path.split("/").pop() ?? path;
    f.extension = path.split(".").pop() ?? "";
    (f as any).stat = { size: 10, mtime: 20, ctime: 1 };
    return f;
}

function mount(bytes: Uint8Array, settings: Record<string, any> = {}) {
    const book = file(PATH);
    const vault = {
        getAbstractFileByPath: (path: string) => (path === book.path ? book : null),
        readBinary: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
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
    return { view: new ReaderView(leaf, host, { store }), content, host, vault, store };
}

/** The live run — not a turning sheet's copy of it. */
const run = (content: DomNode) => content.oneByClass("reader-stage").oneByClass("reader-pv-run");
const slotPages = (content: DomNode) => run(content).byClass("reader-pv-slot").map((slot) => Number(slot.getAttribute("data-page")));
const hostsOf = (content: DomNode) => run(content).byClass("reader-designed-host");
const drawnPages = (content: DomNode) =>
    run(content)
        .byClass("reader-pv-slot")
        .filter((slot) => slot.byClass("reader-designed-host").length > 0)
        .map((slot) => Number(slot.getAttribute("data-page")));

describe("a fixed-layout book, read as it was made (#771)", () => {
    let platform: DesignedPlatform;
    const revoked: string[] = [];
    let minted = 0;
    beforeAll(() => {
        g.DOMParser = class {
            parseFromString(text: string) {
                return { ...parseXml(text), getElementsByTagName: () => [] };
            }
        };
        proto.appendText = function (this: DomNode, text: string) {
            this.createSpan({ text });
        };
        g.URL.createObjectURL = () => `blob:app://obsidian.md/${++minted}`;
        g.URL.revokeObjectURL = (url: string) => revoked.push(url);
        proto.getBoundingClientRect = function (this: DomNode) {
            if (this.classes.has(cls("reader-stage"))) return { left: 0, top: 0, width: VIEW.width, height: VIEW.height };
            if (this.classes.has(cls("reader-pv-run"))) {
                const stage = stageOf(this) as any;
                return { left: -(stage?.scrollLeft ?? 0), top: -(stage?.scrollTop ?? 0), width: 0, height: 0 };
            }
            return originalRect.call(this);
        };
    });
    afterAll(() => {
        delete g.DOMParser;
        delete proto.appendText;
        proto.getBoundingClientRect = originalRect;
    });
    beforeEach(() => {
        resetReaderWorkspace();
        platform = installDesignedPlatform();
        g.fetch = jest.fn();
        g.XMLHttpRequest = jest.fn();
    });
    afterEach(() => {
        platform.undo();
        delete g.fetch;
        delete g.XMLHttpRequest;
    });

    async function open(bytes: Uint8Array = comic(), settings: Record<string, any> = {}, chapter = 0) {
        const m = mount(bytes, settings);
        await m.view.setState({ source: PATH, chapter }, {} as never);
        await m.view.onOpen();
        await settle(() => m.content.byClass("reader-next").length > 0 || m.content.byClass("reader-missing").length > 0);
        await settle(() => m.content.byClass("reader-designed-host").length + m.content.byClass("reader-designed-failed").length > 0, 400, 2000);
        await flush(20);
        return m;
    }

    describe("its look stays inside its page, and nothing runs or is fetched (AC-4, FR-2–FR-4)", () => {
        it("draws each page inside its own shadow root, rebuilt node by node", async () => {
            const { content } = await open(comic(), { readerPrefs: { layout: "page" } });
            const [host] = hostsOf(content);
            expect(host.shadowRoot).not.toBeNull();
            const shadow = host.shadowRoot as DomNode;
            const html = shadow.children[0];
            expect(html.getAttribute("data-zf-html")).toBe("");
            const body = html.children[0];
            expect(body.getAttribute("data-zf-body")).toBe("");
            const balloon = body.find((el) => el.getAttribute("class") === "balloon" || el.classes.has("balloon"));
            expect(balloon?.textContent).toBe("Panel 1");
            // Nothing of the page is in the Reader's own tree: the shadow root is not its child.
            expect(run(content).find((el) => el.textContent === "Panel 1")).toBeUndefined();
        });

        it("makes no style, link or script element anywhere, and sets no style attribute", async () => {
            const { content } = await open(comic(), { readerPrefs: { layout: "page" } });
            const all = everyNode(content);
            expect(all.filter((el) => ["style", "link", "script", "iframe", "meta"].includes(el.tag))).toEqual([]);
            expect(all.filter((el) => el.getAttribute("style") !== null || el.getAttribute("onclick") !== null)).toEqual([]);
            expect(g.pwned).toBeUndefined();
        });

        it("adopts one sheet per page, only into that page's own root, and never the document's", async () => {
            const { content } = await open(comic(), { readerPrefs: { layout: "spread" } });
            press(content as never, "ArrowRight");
            await settle(() => drawnPages(content).length === 2, 400, 2000);
            const hosts = hostsOf(content);
            expect(hosts).toHaveLength(2);
            const sheets = hosts.map((host) => (host.shadowRoot as any).adoptedStyleSheets);
            expect(sheets.every((list) => list.length === 1)).toBe(true);
            expect(sheets[0][0]).not.toBe(sheets[1][0]);
            expect(platform.document.adoptedStyleSheets).toEqual([]);
        });

        it("keeps only URLs it minted from the archive: in the sheet, on the pictures — and fetches nothing", async () => {
            const { content } = await open(comic(), { readerPrefs: { layout: "page" } });
            const sheet = (hostsOf(content)[0].shadowRoot as any).adoptedStyleSheets[0] as FakeSheet;
            expect(sheet.text).not.toContain("example.com");
            expect(sheet.text).not.toContain("@import");
            expect(sheet.text).not.toContain(":host");
            const urls = [...sheet.text.matchAll(/url\("([^"]*)"\)/g)].map((m) => m[1]);
            expect(urls.length).toBeGreaterThan(0);
            expect(urls.every((url) => url.startsWith("blob:"))).toBe(true);
            const img = everyNode(hostsOf(content)[0]).find((el) => el.tag === "img");
            expect(img?.getAttribute("src")).toMatch(/^blob:/);
            // A fixed box is kept inside its page.
            expect(sheet.text).toContain("position:absolute");
            expect(g.fetch).not.toHaveBeenCalled();
            expect(g.XMLHttpRequest).not.toHaveBeenCalled();
        });

        it("loads the book's own font under our name, never a remote one, and lets it go when the book closes", async () => {
            const { content, view } = await open(comic(), { readerPrefs: { layout: "page" } });
            expect(FakeFontFace.made.map((face) => face.family)).toEqual([expect.stringMatching(/^zf-fxl-[a-z0-9]+-0$/)]);
            expect(platform.fonts.size).toBe(1);
            const sheet = (hostsOf(content)[0].shadowRoot as any).adoptedStyleSheets[0] as FakeSheet;
            expect(sheet.text).toContain(`font-family:"${FakeFontFace.made[0].family}"`);
            await view.onClose();
            expect(platform.fonts.size).toBe(0);
        });

        it("keeps the Reader's own bar and title line free of anything from the book", async () => {
            const { content } = await open(comic(), { readerPrefs: { layout: "page" } });
            const chrome = [...content.byClass("reader-bar"), ...content.byClass("reader-path-title")];
            expect(chrome.length).toBeGreaterThan(0);
            for (const el of chrome.flatMap((node) => [node, ...everyNode(node)])) {
                expect([...el.classes].filter((name) => name === "balloon")).toEqual([]);
            }
        });

        it("never draws a page with loose styles where the platform cannot keep them inside: it says so", async () => {
            platform.undo();
            platform = installDesignedPlatform({ supported: false });
            const warn = jest.spyOn(log, "warn").mockImplementation(() => undefined);
            const { content } = await open(comic(), { readerPrefs: { layout: "page" } });
            expect(content.byClass("reader-designed-host")).toHaveLength(0);
            expect(content.oneByClass("reader-designed-failed").textContent).toBe("This page could not be drawn.");
            expect(FakeSheet.made).toHaveLength(0);
            expect(warn).toHaveBeenCalled();
            warn.mockRestore();
        });

        it("shows one calm line for a page that cannot be drawn, and still turns past it", async () => {
            const warn = jest.spyOn(log, "warn").mockImplementation(() => undefined);
            const { content } = await open(comic({ broken: 1 }), { readerPrefs: { layout: "page" } });
            press(content as never, "ArrowRight");
            await settle(() => slotPages(content).includes(1) && content.byClass("reader-designed-failed").length > 0, 400, 2000);
            expect(content.oneByClass("reader-designed-failed").textContent).toBe("This page could not be drawn.");
            expect(warn).toHaveBeenCalled();
            press(content as never, "ArrowRight");
            await settle(() => slotPages(content).includes(2), 400, 2000);
            expect(slotPages(content)).toEqual([2]);
            warn.mockRestore();
        });
    });

    describe("fitted, zoomed, in pages or a spread (AC-5, FR-5, FR-6, FR-8)", () => {
        it("opens fitted: the page is drawn once at its size and scaled to its slot", async () => {
            const { content } = await open(comic(), { readerPrefs: { layout: "page" } });
            // Fit page: the whole 600 x 800 page in a 600-high view, below the hint — less than Fit width.
            expect(parseInt(content.oneByClass("reader-bar-zoom").textContent, 10)).toBeLessThan(100);
            const host = hostsOf(content)[0];
            expect(host.cssProps["--zf-fxl-w"]).toBe("600px");
            expect(host.cssProps["--zf-fxl-h"]).toBe("800px");
            const picture = run(content).oneByClass("reader-pv-designed");
            expect(Number(picture.cssProps["--zf-fxl-scale"])).toBeGreaterThan(0);
        });

        it("zooms with Ctrl + and 0 through Page view's own run, never a second control", async () => {
            const { content, view } = await open(comic(), { readerPrefs: { layout: "page" } });
            const label = () => content.oneByClass("reader-bar-zoom").textContent;
            const before = label();
            const evt: any = { key: "=", ctrlKey: true, defaultPrevented: false, preventDefault: () => (evt.defaultPrevented = true), stopPropagation: () => undefined };
            (view as any).scope.handleKey(evt, { modifiers: "Mod", key: "=" });
            expect(label()).not.toBe(before);
            const zero: any = { key: "0", ctrlKey: true, preventDefault: () => undefined, stopPropagation: () => undefined };
            (view as any).scope.handleKey(zero, { modifiers: "Mod", key: "0" });
            // Back to the whole page, as it opened.
            expect(label()).toBe(before);
        });

        it("shows one page in Page, the book's pairs in Spread — its first page alone — and the run in Scroll", async () => {
            const page = await open(comic(), { readerPrefs: { layout: "page" } });
            expect(slotPages(page.content)).toEqual([0]);
            const spread = await open(comic(), { readerPrefs: { layout: "spread" } });
            expect(slotPages(spread.content)).toEqual([0]);
            press(spread.content as never, "ArrowRight");
            await settle(() => slotPages(spread.content).length === 2, 400, 2000);
            expect(slotPages(spread.content)).toEqual([1, 2]);
            // In Scroll the run holds every page, one under another (only the near ones drawn).
            const scroll = await open(comic(), { readerPrefs: { layout: "scroll" } });
            expect(parseFloat(run(scroll.content).cssProps["--zf-run-h"])).toBeGreaterThan(4 * VIEW.height);
        });

        it("reads a spread when you never chose a layout and the reading is landscape", async () => {
            const { content } = await open(comic(), {});
            press(content as never, "ArrowRight");
            await settle(() => slotPages(content).length === 2, 400, 2000);
            expect(slotPages(content)).toEqual([1, 2]);
        });

        it("says it is read-only once a reading, quietly, over three turns", async () => {
            const { content } = await open(comic(), { readerPrefs: { layout: "page" } });
            expect(content.byClass("reader-designed-hint").map((el) => el.textContent)).toEqual([
                "This page is shown as it was designed. Highlights and search are not available on designed pages.",
            ]);
            for (const page of [1, 2, 3]) {
                press(content as never, "ArrowRight");
                await settle(() => slotPages(content).includes(page), 400, 2000);
                expect(content.oneByClass("reader-stage").byClass("reader-designed-hint")).toHaveLength(0);
            }
        });

        it("has nothing to search, and says why", async () => {
            const { content, view } = await open(comic(), { readerPrefs: { layout: "page" } });
            (view as any).openSearch();
            const input = content.oneByClass("reader-search-input") as any;
            input.value = "panel";
            input.fire("input");
            await settle(() => content.oneByClass("reader-search-count").textContent !== "", 400, 2000);
            await flush(10);
            expect(content.oneByClass("reader-search-count").textContent).toBe("This book's pages are designed, so there is no text to search");
        });

        it("offers no Pages tab and no rotate or crop: a designed page is never redrawn as a picture", async () => {
            const { content } = await open(comic(), { readerPrefs: { layout: "page" } });
            content.byClass("reader-bar-button").find((el) => el.getAttribute("aria-label") === "Contents")?.click();
            expect(content.byClass("reader-tab").map((el) => el.textContent)).not.toContain("Pages");
            content.byClass("reader-bar-button").find((el) => el.getAttribute("aria-label") === "Type")?.click();
            expect(content.byClass("reader-pv-crop")).toHaveLength(0);
        });

        it("tells the time left by pages, at the default pace before you have read three", async () => {
            const { content } = await open(comic({ count: 10 }), { readerPrefs: { layout: "page" } });
            // Ten pages at half a minute each.
            expect(content.oneByClass("reader-bar-minutes").textContent).toBe("5 minutes left");
            // Counted in pages, not chapters.
            expect(content.oneByClass("reader-bar-label").textContent).toBe("Page 1 / 10");
        });
    });

    describe("Fit page lands in the middle after any reshape (#771, the walk's limitation)", () => {
        let record: AnimationRecord | undefined;
        afterEach(() => {
            record?.stop();
            record = undefined;
            VIEW.width = 800;
            VIEW.height = 600;
        });
        const slotOf = (content: DomNode) => run(content).byClass("reader-pv-slot")[0];
        const px = (slot: DomNode, name: string) => parseFloat(slot.cssProps[name] ?? "0");

        it("re-centres a fitted page in the free area when an iPad turns, and glides there", async () => {
            const { content, view } = await open(comic(), { readerPrefs: { layout: "page" } });
            record = recordAnimations();
            VIEW.width = 600;
            VIEW.height = 900;
            (view as any).pageRun.reshape();
            const slot = slotOf(content);
            const stage = content.oneByClass("reader-stage") as any;
            expect(stage.scrollTop).toBe(0);
            // Centred down the free area (the whole stage here: nothing above the run in the fake).
            expect(Math.abs(px(slot, "--zf-slot-y") - (VIEW.height - px(slot, "--zf-slot-h")) / 2)).toBeLessThanOrEqual(1);
            const glide = record.animations.find((a) => a.target?.classes?.has?.(cls("reader-pv-run")));
            expect(glide?.options.duration).toBe(250);
            for (const frame of glide?.keyframes ?? []) for (const key of Object.keys(frame)) expect(["translate", "scale"]).toContain(key);
        });

        it("is simply there under reduced motion", async () => {
            const { content, view } = await open(comic(), { readerPrefs: { layout: "page" } });
            const undo = reducedMotion(true);
            record = recordAnimations();
            VIEW.width = 600;
            VIEW.height = 900;
            (view as any).pageRun.reshape();
            const slot = slotOf(content);
            expect(px(slot, "--zf-slot-y")).toBeGreaterThan(16);
            expect(Math.abs(px(slot, "--zf-slot-y") - (VIEW.height - px(slot, "--zf-slot-h")) / 2)).toBeLessThanOrEqual(1);
            expect(record.animations).toHaveLength(0);
            undo();
        });

        it("keeps the point under your eyes when you zoomed in: only Fit page re-centres", async () => {
            const { content, view } = await open(comic(), { readerPrefs: { layout: "page" } });
            const evt: any = { key: "=", ctrlKey: true, preventDefault: () => undefined, stopPropagation: () => undefined };
            (view as any).scope.handleKey(evt, { modifiers: "Mod", key: "=" });
            VIEW.width = 600;
            VIEW.height = 900;
            (view as any).pageRun.reshape();
            expect(px(slotOf(content), "--zf-slot-y")).toBe(16);
        });
    });

    describe("turning (FR-7, FR-12)", () => {
        it("turns a right-to-left book the other way: ← is next", async () => {
            const { content } = await open(comic({ direction: "rtl", extra: (i) => (i === 0 ? { properties: "page-spread-left" } : {}) }), { readerPrefs: { layout: "page" } });
            press(content as never, "ArrowLeft");
            await settle(() => slotPages(content).includes(1), 400, 2000);
            expect(slotPages(content)).toEqual([1]);
            press(content as never, "ArrowRight");
            await settle(() => slotPages(content).includes(0), 400, 2000);
            expect(slotPages(content)).toEqual([0]);
        });

        it("lays a right-to-left spread with its first page on the right of the spine", async () => {
            const { content } = await open(comic({ direction: "rtl", extra: (i) => (i === 0 ? { properties: "page-spread-left" } : {}) }), { readerPrefs: { layout: "spread" } });
            press(content as never, "ArrowLeft");
            await settle(() => slotPages(content).length === 2, 400, 2000);
            const slots = run(content).byClass("reader-pv-slot");
            const x = (page: number) => parseFloat(slots.find((s) => s.getAttribute("data-page") === String(page))?.cssProps["--zf-slot-x"] ?? "0");
            expect(x(1)).toBeGreaterThan(x(2));
        });

        it("keeps the page for the Library, and opens on it again", async () => {
            const first = await open(comic(), { readerPrefs: { layout: "page" } });
            press(first.content as never, "ArrowRight");
            press(first.content as never, "ArrowRight");
            await settle(() => slotPages(first.content).includes(2), 400, 2000);
            expect((first.host.settings.library as any)[PATH]).toMatchObject({ chapter: 2 });
            const again = await open(comic(), { readerPrefs: { layout: "page" }, library: first.host.settings.library }, (first.host.settings.library as any)[PATH].chapter);
            expect(slotPages(again.content)).toEqual([2]);
        });
    });

    describe("light on memory (FR-9)", () => {
        it("holds only the pages near the one on screen, and lets the others' pictures go", async () => {
            const { content } = await open(comic({ count: 24 }), { readerPrefs: { layout: "spread" } });
            let peak = 0;
            for (let i = 0; i < 8; i++) {
                press(content as never, "ArrowRight");
                await flush(20);
                peak = Math.max(peak, hostsOf(content).length);
            }
            // On screen: the view's two pages; held: at most the view and two pages either side.
            expect(peak).toBeLessThanOrEqual(6);
            expect(hostsOf(content).length).toBeLessThanOrEqual(2);
            await settle(() => revoked.length > 0, 400, 3000);
            expect(revoked.length).toBeGreaterThan(0);
        });
    });

    describe("motion never costs a frame (AC-7, FR-15, FR-16)", () => {
        let record: AnimationRecord;
        afterEach(() => record?.stop());

        it("fades a page in over 120 ms, and moves only transform and opacity", async () => {
            record = recordAnimations();
            const { content } = await open(comic(), { readerPrefs: { layout: "page" } });
            await settle(() => drawnPages(content).includes(0), 400, 2000);
            const arrival = record.animations.find((a) => a.target?.classes?.has?.(cls("reader-pv-designed")));
            expect(arrival?.options.duration).toBe(120);
            expect(arrival?.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
            for (const key of record.keys()) expect(["transform", "opacity", "translate", "scale", "rotate", "offset", "easing", "visibility", "transformOrigin", "composite"]).toContain(key);
        });

        it("plays nothing under reduced motion: the page is simply there", async () => {
            const undo = reducedMotion(true);
            record = recordAnimations();
            const { content } = await open(comic(), { readerPrefs: { layout: "page" } });
            press(content as never, "ArrowRight");
            await settle(() => drawnPages(content).includes(1), 400, 2000);
            expect(record.animations).toHaveLength(0);
            undo();
        });
    });

    describe("a book that mixes designed pages and flowing chapters (FR-1)", () => {
        it("draws a designed page fitted to the column, and a flowing chapter in your type", async () => {
            const mixed = makeEpub({
                title: "A Cookbook",
                chapters: [
                    { id: "c1", href: "text/intro.xhtml", title: "Intro", body: '<p style="color:red" class="x">Welcome to the kitchen.</p>' },
                    { id: "c2", href: "pages/recipe.xhtml", title: "Bread", head: viewport, properties: "rendition:layout-pre-paginated", body: '<div class="balloon">Flour</div>' },
                ],
                extra: { "OEBPS/css/page.css": PAGE_CSS, "OEBPS/img/panel.png": new Uint8Array([1]), "OEBPS/fonts/comic.woff2": new Uint8Array([1]) },
            });
            const flowing = await open(mixed);
            expect(flowing.content.byClass("reader-designed-host")).toHaveLength(0);
            const p = flowing.content.oneByClass("reader-source-body").find((el) => el.tag === "p");
            expect(p?.getAttribute("class")).toBeNull();
            const designed = await open(mixed, {}, 1);
            const fit = designed.content.oneByClass("reader-designed-fit");
            expect(fit.cssProps["--zf-fxl-ratio"]).toBe("600 / 800");
            expect(fit.oneByClass("reader-designed-host").shadowRoot).not.toBeNull();
            expect(designed.content.byClass("reader-designed-hint")).toHaveLength(1);
        });
    });
});

void withTextNodes;
