/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { MarkdownRenderer, TFile, WorkspaceLeaf } from "obsidian";
import { DomNode, flush, installBrowserGlobals } from "../../../../support/dashboardDom";
import { recordAnimations, reducedMotion, type AnimationRecord } from "../../../../support/motionDom";
import { press } from "../../../../support/readerKeys";
import { touchSwipe, touchTap } from "../../../../support/pointer";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import * as turnModule from "architecture/components/core/reader/readerTurn";
import { ReaderHighlights } from "architecture/components/core/reader/readerHighlights";
import { resetReaderWorkspace } from "architecture/components/core/reader/openReader";

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.extension = "md";
    return f;
}

const BODY = Array.from({ length: 6 }, (_, i) => `Paragraph ${i} of the chapter.`).join("\n\n");

/**
 * A reading of notes, its stage 1000 × 700 and every chapter laid out as `pages` columns — worked out
 * from the custom properties the pager wrote, the way the stylesheet would lay them out.
 */
async function open(paths = ["a.md", "b.md", "c.md"], pages = 4, prefs?: Record<string, unknown>) {
    const files: Record<string, string> = { "a.md": BODY, "b.md": BODY, "c.md": "A short note." };
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
    const plugin = { settings: { readingMotion: { chapter: "stack" }, ...(prefs ? { readerPrefs: prefs } : {}) } as Record<string, any>, saveSettings: jest.fn(async () => undefined) };
    const view = new ReaderView(leaf, plugin);
    const stagePages = { count: pages };
    // The shell is built by onOpen; its stage and page are given a size before the first chapter lands.
    const build = (view as any).buildShell.bind(view);
    (view as any).buildShell = () => {
        build();
        const stage = content.oneByClass("reader-stage") as any;
        const page = content.oneByClass("reader-page") as any;
        stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 700 });
        stage.clientHeight = 700;
        stage.scrollHeight = 700;
        const prop = (name: string) => parseFloat(page.cssProps[name] ?? "0") || 0;
        Object.defineProperty(page, "scrollWidth", { configurable: true, get: () => prop("--zf-page-col") + (prop("--zf-page-col") + prop("--zf-page-gap")) * (stagePages.count - 1) });
        page.getBoundingClientRect = () => ({ left: prop("--zf-page-gap") + prop("--zf-page-x"), top: 0, width: prop("--zf-page-w"), height: 700 });
    };
    await view.setState({ seed: paths[0], kind: "selection", paths }, {} as never);
    await view.onOpen();
    await flush();
    const root = content.oneByClass("reader") as any;
    const stage = content.oneByClass("reader-stage") as any;
    const page = content.oneByClass("reader-page") as any;
    const pager = () => (view as any).pager;
    return { view, plugin, content, root, stage, page, pager, stagePages };
}

const count = (content: DomNode) => content.oneByClass("reader-count").textContent;
const typeButton = (content: DomNode) => content.byClass("reader-bar-button").find((b) => b.getAttribute("aria-label") === "Type")!;
const layoutOption = (content: DomNode, label: string) => content.byClass("reader-type-option").find((b) => b.text === label)!;

describe("pages or scroll (#753)", () => {
    let rec: AnimationRecord;
    let motion: () => void;
    beforeEach(() => {
        installBrowserGlobals();
        (globalThis as any).addEventListener ??= () => undefined;
        (globalThis as any).removeEventListener ??= () => undefined;
        (globalThis as any).innerWidth = 1000;
        resetReaderWorkspace();
        MarkdownRenderer.calls = [];
        rec = recordAnimations();
        motion = reducedMotion(false);
    });
    afterEach(() => {
        turnModule.endChapterTurn();
        rec.stop();
        motion();
        jest.restoreAllMocks();
        delete (globalThis as any).innerWidth;
    });

    it("offers Scroll, Page and Spread in the Type panel; a pick is saved and worn at once (AC-2)", async () => {
        const { content, plugin, root } = await open();
        typeButton(content).click();
        const options = content.byClass("reader-type-row")[0].byClass("reader-type-option");
        expect(options.map((o) => o.text)).toEqual(["Scroll", "Page", "Spread"]);
        expect(options[0].hasClass("is-active")).toBe(true);
        expect(root.hasClass("zettelkasten-flow__reader--layout-page")).toBe(false);
        layoutOption(content, "Page").click();
        expect(plugin.settings.readerPrefs.layout).toBe("page");
        expect(plugin.saveSettings).toHaveBeenCalled();
        expect(root.hasClass("zettelkasten-flow__reader--layout-page")).toBe(true);
        expect(layoutOption(content, "Page").hasClass("is-active")).toBe(true);
    });

    it("turns a page with Space and →, and past the last page goes to the next chapter with its turn (AC-3)", async () => {
        const { content, pager, view } = await open(undefined, 3, { layout: "page" });
        const turn = jest.spyOn(turnModule, "playChapterTurn");
        expect(pager().views).toBe(3);
        press({ view } as any, " ");
        expect(pager().current).toBe(1);
        press({ view } as any, "ArrowRight");
        expect(pager().current).toBe(2);
        expect(count(content)).toBe("01 / 03");
        press({ view } as any, "ArrowRight");
        await flush();
        expect(count(content)).toBe("02 / 03");
        expect(turn).toHaveBeenCalled();
        expect(pager().current).toBe(0);
    });

    it("goes back from a chapter's first page to the previous chapter's last page", async () => {
        const { content, pager, view } = await open(undefined, 3, { layout: "page" });
        press({ view } as any, "ArrowRight");
        press({ view } as any, "ArrowRight");
        press({ view } as any, "ArrowRight");
        await flush();
        expect(count(content)).toBe("02 / 03");
        press({ view } as any, "ArrowLeft");
        await flush();
        expect(count(content)).toBe("01 / 03");
        expect(pager().current).toBe(2);
        // On its last page, forward is the next chapter again.
        press({ view } as any, "ArrowRight");
        await flush();
        expect(count(content)).toBe("02 / 03");
    });

    it("leaves every key of Scroll as it was: → is the next chapter (FR-4)", async () => {
        const { content, view, pager } = await open();
        press({ view } as any, "ArrowRight");
        await flush();
        expect(count(content)).toBe("02 / 03");
        expect(pager().paged).toBe(false);
    });

    it("fits a short note in one page, and Space goes on to the end card (the empty state)", async () => {
        const { content, view, pager } = await open(["c.md"], 1, { layout: "page" });
        expect(pager().views).toBe(1);
        press({ view } as any, " ");
        await flush();
        expect(content.oneByClass("reader-bar-label").textContent).toBe("The end");
        // The end card is never paged.
        expect(content.oneByClass("reader").hasClass("zettelkasten-flow__reader--layout-page")).toBe(false);
    });

    it("turns with a tap on the edge, and a swipe holds the strip and turns it past a third (FR-2, FR-13)", async () => {
        const { pager, stage } = await open(undefined, 4, { layout: "page" });
        touchTap(stage, { x: 950, y: 300 });
        expect(pager().current).toBe(1);
        touchTap(stage, { x: 40, y: 300 });
        expect(pager().current).toBe(0);
        touchSwipe(stage, { x: 800, y: 300 }, { x: 300, y: 305 });
        expect(pager().current).toBe(1);
        // No chapter sheet: a page is not a chapter.
        expect(stage.parent.byClass("turn-sheet")).toHaveLength(0);
    });

    it("hands a swipe past the chapter's last page to the chapter's own turn, through go(1)", async () => {
        const { content, pager, stage, view } = await open(undefined, 2, { layout: "page" });
        press({ view } as any, " ");
        expect(pager().atEnd()).toBe(true);
        const go = jest.spyOn(view as any, "go");
        touchSwipe(stage, { x: 800, y: 300 }, { x: 300, y: 305 });
        await flush();
        expect(go).toHaveBeenCalledWith(1, "start");
        expect(count(content)).toBe("02 / 03");
    });

    it("puts the popovers away on a turn, as a scroll does (FR-5)", async () => {
        const onScroll = jest.spyOn(ReaderHighlights.prototype, "onScroll");
        const { view } = await open(undefined, 3, { layout: "page" });
        onScroll.mockClear();
        press({ view } as any, " ");
        expect(onScroll).toHaveBeenCalled();
    });

    it("says what the keys do in the layout you read in (FR-11)", async () => {
        const { content, view } = await open(undefined, 3, { layout: "page" });
        press({ view } as any, "?");
        const labels = content.byClass("reader-shortcuts-label").map((el) => el.textContent);
        expect(labels[0]).toBe("Next page, then the next chapter");
        expect(labels).not.toContain("Next chapter");
        press({ view } as any, "Escape");
        const scroll = await open();
        press({ view: scroll.view } as any, "?");
        expect(scroll.content.byClass("reader-shortcuts-label")[0].textContent).toBe("Next chapter");
    });

    it("keeps the page you were on through a change of layout and size, and settles the text around it (FR-6, FR-14)", async () => {
        const { content, pager } = await open(undefined, 6, { layout: "page" });
        typeButton(content).click();
        layoutOption(content, "Spread").click();
        expect(content.oneByClass("reader").hasClass("zettelkasten-flow__reader--layout-spread")).toBe(true);
        expect(pager().paged).toBe(true);
        // The settle animates opacity and translate, nothing else, and the marker slides by transform.
        for (const key of rec.keys()) expect(["opacity", "translate", "transform"]).toContain(key);
        expect(rec.animations.some((a) => a.target.hasClass?.("zettelkasten-flow__reader-type-marker"))).toBe(true);
        layoutOption(content, "Scroll").click();
        expect(pager().paged).toBe(false);
        expect(content.oneByClass("reader").hasClass("zettelkasten-flow__reader--layout-spread")).toBe(false);
    });

    it("turns instantly under reduced motion (FR-16)", async () => {
        motion();
        motion = reducedMotion(true);
        const { view, pager } = await open(undefined, 3, { layout: "page" });
        press({ view } as any, " ");
        expect(pager().current).toBe(1);
        expect(rec.animations).toHaveLength(0);
    });
});
