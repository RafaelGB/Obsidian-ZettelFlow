import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { Component, MarkdownRenderer, Platform, TFile, WorkspaceLeaf } from "obsidian";
import { DomNode, flush } from "../../../../support/dashboardDom";
import { FakeEl } from "../../../../support/textDom";
import { press } from "../../../../support/readerKeys";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import { openReader, resetReaderWorkspace } from "architecture/components/core/reader/openReader";
import { ReaderHighlights, type HighlightStore, type SelectionInfo } from "architecture/components/core/reader/readerHighlights";
import { minutesFor, minutesLeft, readFraction, scrolls, wordCount } from "architecture/components/core/reader/readerPace";
import { ReaderComponent } from "starters/zcomponents/ReaderComponent";

/**
 * The owner's walk of the Reader (#667): selecting with the mouse did nothing, ← → were wanted the
 * Obsidian way, Esc should close the tab and give the workspace back — and the reader should be a
 * pleasure to use. These hold what that walk asked for.
 */
const ROOT = join(__dirname, "..", "..", "..", "..", "..");

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.extension = "md";
    return f;
}

/** 660 words: three minutes at 220 a minute. */
const LONG = Array.from({ length: 660 }, (_, i) => `word${i}`).join(" ");

function mount(settings: Record<string, unknown> = {}, extraWorkspace: Record<string, unknown> = {}) {
    const files: Record<string, string> = { "a.md": LONG, "b.md": "The body of B.", "c.md": "The body of C." };
    const previous = { id: "editor" };
    const app = {
        workspace: {
            requestSaveLayout: jest.fn(),
            openLinkText: jest.fn(),
            iterateAllLeaves: (fn: (leaf: unknown) => void) => fn(previous),
            setActiveLeaf: jest.fn(),
            trigger: jest.fn(),
            ...extraWorkspace,
        },
        vault: {
            getAbstractFileByPath: (path: string) => (files[path] !== undefined ? file(path) : null),
            cachedRead: async (f: TFile) => files[f.path],
        },
        metadataCache: { getFirstLinkpathDest: () => null, on: () => ({}) },
    };
    const content = new DomNode();
    const leaf = new WorkspaceLeaf(app, content) as unknown as WorkspaceLeaf & { detach: jest.Mock };
    leaf.detach = jest.fn();
    const plugin = { settings, saveSettings: jest.fn(async () => undefined) };
    const view = new ReaderView(leaf, plugin);
    return { view, app, content, leaf, plugin, previous };
}

async function open(settings: Record<string, unknown> = {}, extraWorkspace: Record<string, unknown> = {}) {
    const m = mount(settings, extraWorkspace);
    await m.view.setState({ seed: "a.md", kind: "selection", paths: ["a.md", "b.md", "c.md"] }, {} as never);
    await m.view.onOpen();
    await flush();
    return m;
}

const count = (content: DomNode) => content.oneByClass("reader-count").textContent;
const root = (content: DomNode) => content.oneByClass("reader");

describe("the keys, the Obsidian way (#667)", () => {
    beforeEach(() => {
        resetReaderWorkspace();
        MarkdownRenderer.calls = [];
    });

    it("registers on the view's own scope, so the keys work wherever focus is", async () => {
        const { content, leaf } = await open();
        // The target is not the reader: focus sits on the page, the bar, anywhere — the scope still has it.
        const evt = press(leaf, "ArrowRight", { target: new DomNode("button") });
        await flush();
        expect(count(content)).toBe("02 / 03");
        expect(evt.defaultPrevented).toBe(true);
        press(leaf, "ArrowLeft", { target: new DomNode("button") });
        await flush();
        expect(count(content)).toBe("01 / 03");
    });

    it("leaves a key typed into a field alone", async () => {
        const { content, leaf } = await open();
        const evt = press(leaf, "ArrowRight", { target: { tagName: "TEXTAREA" } });
        await flush();
        expect(count(content)).toBe("01 / 03");
        expect(evt.defaultPrevented).toBe(false);
    });

    it("takes Esc, so Obsidian's own Esc never hands the focus to another tab", async () => {
        const { leaf } = await open();
        const evt = press(leaf, "Escape", { target: new DomNode() });
        expect(evt.defaultPrevented).toBe(true);
        expect(leaf.detach).toHaveBeenCalled();
    });

    it("pages down a long chapter with Space, and turns the page at its end", async () => {
        const { content, leaf } = await open();
        const stage = content.oneByClass("reader-stage") as DomNode & { scrollHeight: number; clientHeight: number };
        stage.scrollHeight = 2000;
        stage.clientHeight = 500;
        press(leaf, " ");
        await flush();
        expect(count(content)).toBe("01 / 03");
        expect(stage.scrollTop).toBe(425);
        stage.scrollTop = 1500;
        press(leaf, " ");
        await flush();
        expect(count(content)).toBe("02 / 03");
        // Shift+Space at the top goes back a chapter.
        press(leaf, " ", { shiftKey: true });
        await flush();
        expect(count(content)).toBe("01 / 03");
    });

    it("opens and closes the shortcuts sheet with ?, and Esc closes it before anything else", async () => {
        const { content, leaf } = await open();
        press(leaf, "?", { shiftKey: true });
        expect(content.byClass("reader-shortcuts")).toHaveLength(1);
        expect(content.oneByClass("reader-shortcuts").textContent).toContain("Next chapter");
        press(leaf, "Escape");
        expect(content.byClass("reader-shortcuts")).toHaveLength(0);
        expect(leaf.detach).not.toHaveBeenCalled();
        // The bar's own button opens it too.
        content.find((el) => el.getAttribute("aria-label") === "Keyboard shortcuts")!.click();
        expect(content.byClass("reader-shortcuts")).toHaveLength(1);
    });
});

describe("the reader's commands (#667)", () => {
    function component(active: unknown) {
        const commands: { id: string; checkCallback: (checking: boolean) => boolean }[] = [];
        const app = {
            workspace: {
                getActiveViewOfType: (type: new (...args: never[]) => unknown) => (active instanceof type ? active : null),
                getActiveFile: () => null,
                on: () => ({}),
            },
        };
        const plugin = { app, addCommand: (c: (typeof commands)[number]) => commands.push(c), registerEvent: jest.fn() };
        new ReaderComponent(plugin as never).onLoad();
        return (id: string) => commands.find((c) => c.id === id)!;
    }

    it("are offered only while a reading is the active view", async () => {
        const none = component(null);
        for (const id of ["reader-next-chapter", "reader-previous-chapter", "reader-exit"]) {
            expect(none(id).checkCallback(true)).toBe(false);
        }
        const { view } = await open();
        const reading = component(view);
        for (const id of ["reader-next-chapter", "reader-previous-chapter", "reader-exit"]) {
            expect(reading(id).checkCallback(true)).toBe(true);
        }
    });

    it("turn the page and leave it", async () => {
        resetReaderWorkspace();
        const { view, content, leaf } = await open();
        const command = component(view);
        command("reader-next-chapter").checkCallback(false);
        await flush();
        expect(count(content)).toBe("02 / 03");
        command("reader-previous-chapter").checkCallback(false);
        await flush();
        expect(count(content)).toBe("01 / 03");
        command("reader-exit").checkCallback(false);
        expect(leaf.detach).toHaveBeenCalled();
    });
});

describe("leaving gives the workspace back (#667)", () => {
    beforeEach(() => {
        resetReaderWorkspace();
        (Platform as { isMobile: boolean }).isMobile = false;
    });
    afterEach(() => jest.useRealTimers());

    function side() {
        const s = { collapsed: false, collapse: () => (s.collapsed = true), expand: () => (s.collapsed = false) };
        return s;
    }

    async function opened() {
        const left = side();
        const right = side();
        const order: string[] = [];
        const previous = { id: "editor" };
        const extra = {
            leftSplit: left,
            rightSplit: right,
            getMostRecentLeaf: () => previous,
            getLeavesOfType: () => [],
            getLeaf: () => ({ setViewState: async () => undefined }),
            revealLeaf: async () => undefined,
            iterateAllLeaves: (fn: (leaf: unknown) => void) => fn(previous),
            setActiveLeaf: jest.fn(() => order.push("activate")),
        };
        const m = await open({}, extra);
        await openReader(m.app as never, "a.md");
        m.leaf.detach.mockImplementation(() => order.push("detach"));
        return { ...m, left, right, previous, order, ws: extra };
    }

    it("restores the sidebars, re-activates the leaf you were in, then closes the reader", async () => {
        const { view, left, right, previous, order, ws } = await opened();
        expect([left.collapsed, right.collapsed]).toEqual([true, true]);
        view.exit();
        expect([left.collapsed, right.collapsed]).toEqual([false, false]);
        expect(ws.setActiveLeaf).toHaveBeenCalledWith(previous, { focus: true });
        expect(order).toEqual(["activate", "detach"]);
    });

    it("plays the leaving fade first when motion is welcome, and only once", async () => {
        const { view, content, leaf } = await opened();
        jest.useFakeTimers();
        (content as unknown as { win: unknown }).win = { matchMedia: () => ({ matches: false }) };
        view.exit();
        view.exit();
        expect(root(content).hasClass("zettelkasten-flow__reader--leaving")).toBe(true);
        expect(leaf.detach).not.toHaveBeenCalled();
        jest.advanceTimersByTime(300);
        expect(leaf.detach).toHaveBeenCalledTimes(1);
    });

    it("goes at once when reduced motion is asked for", async () => {
        const { view, content, leaf } = await opened();
        (content as unknown as { win: unknown }).win = { matchMedia: () => ({ matches: true }) };
        view.exit();
        expect(leaf.detach).toHaveBeenCalledTimes(1);
    });

    it("still gives everything back when the tab is closed another way", async () => {
        const { view, left, ws, previous } = await opened();
        await view.onClose();
        expect(left.collapsed).toBe(false);
        expect(ws.setActiveLeaf).toHaveBeenCalledWith(previous, { focus: true });
    });
});

describe("progress and minutes left (#667)", () => {
    it("counts words and minutes the way the bar says them", () => {
        expect(wordCount("It's a well-known idea — in 3 words?")).toBe(7);
        expect(wordCount("")).toBe(0);
        expect(minutesFor(0)).toBe(0);
        expect(minutesFor(1)).toBe(1);
        expect(minutesFor(660)).toBe(3);
        expect(readFraction(250, 1000, 500)).toBe(0.5);
        // A page that fits on screen is at its start, not read the moment it opens.
        expect(readFraction(0, 400, 500)).toBe(0);
        expect(scrolls(400, 500)).toBe(false);
        expect(minutesLeft(660, 0.5)).toBe(2);
        expect(minutesLeft(660, 0.99)).toBe(0);
    });

    beforeEach(() => resetReaderWorkspace());

    it("fills the hairline and says the minutes left as you scroll", async () => {
        const { content } = await open();
        const stage = content.oneByClass("reader-stage") as DomNode & { scrollHeight: number; clientHeight: number };
        const minutes = content.oneByClass("reader-bar-minutes");
        expect(minutes.textContent).toBe("3 minutes left");
        stage.scrollHeight = 1000;
        stage.clientHeight = 500;
        stage.scrollTop = 250;
        stage.fire("scroll");
        expect(content.oneByClass("reader-hairline").cssProps["--zf-reader-read"]).toBe("0.5");
        expect(minutes.textContent).toBe("2 minutes left");
        stage.scrollTop = 500;
        stage.fire("scroll");
        expect(minutes.hasClass("zettelkasten-flow__reader-hidden")).toBe(true);
        // At the bottom, the way on lights up.
        expect(content.oneByClass("reader-next").hasClass("zettelkasten-flow__reader-next--arrived")).toBe(true);
    });

    it("names the next chapter and how long it is at the end of this one", async () => {
        const { content } = await open();
        expect(content.oneByClass("reader-next-label").textContent).toBe("Next · b");
        expect(content.oneByClass("reader-next-minutes").textContent).toBe("1 minute");
    });

    it("turns the page the way you went", async () => {
        const { content, leaf } = await open();
        const page = content.oneByClass("reader-page");
        expect(page.hasClass("zettelkasten-flow__reader-page--enter")).toBe(true);
        press(leaf, "ArrowRight");
        await flush();
        expect(page.hasClass("zettelkasten-flow__reader-page--forward")).toBe(true);
        press(leaf, "ArrowLeft");
        await flush();
        expect(page.hasClass("zettelkasten-flow__reader-page--back")).toBe(true);
        expect(page.hasClass("zettelkasten-flow__reader-page--forward")).toBe(false);
    });
});

describe("focus mode (#667)", () => {
    beforeEach(() => resetReaderWorkspace());

    it("is a switch in the type panel, worn at once and kept", async () => {
        const { content, plugin } = await open();
        content.find((el) => el.getAttribute("aria-label") === "Type")!.click();
        const toggle = content.oneByClass("reader-focus-toggle");
        expect(toggle.getAttribute("aria-pressed")).toBe("false");
        toggle.click();
        expect(root(content).hasClass("zettelkasten-flow__reader--focus")).toBe(true);
        expect((plugin.settings as { readerPrefs: { focus: boolean } }).readerPrefs.focus).toBe(true);
        expect(content.oneByClass("reader-focus-toggle").getAttribute("aria-pressed")).toBe("true");
        // The block at the reading line is the one left lit.
        expect(content.oneByClass("reader-body").children[0].hasClass("zettelkasten-flow__reader-focus-current")).toBe(true);
    });

    it("opens in focus mode next time", async () => {
        const { content } = await open({ readerPrefs: { focus: true } });
        expect(root(content).hasClass("zettelkasten-flow__reader--focus")).toBe(true);
    });
});

describe("highlighting with the mouse (#667)", () => {
    it("re-enables selection on the chapter, which Obsidian's body { user-select: none } takes away", () => {
        // The real cause of "I select with the mouse and nothing happens": in Obsidian 1.14 only its
        // editors and `.markdown-preview-view` get `user-select: text` back. The reader's body is a
        // `.markdown-rendered` div — without this rule, no selection, no popover.
        const scss = readFileSync(join(ROOT, "src", "styles", "components", "reader.scss"), "utf8");
        const rule = scss.match(/([^{}]*)\{[^}]*user-select:\s*text/);
        expect(rule).not.toBeNull();
        expect(rule![1]).toContain(".zettelkasten-flow__reader-body");
    });

    function chapter(): FakeEl {
        return new FakeEl("div", [new FakeEl("p", ["Event sourcing stores changes, not state."])]);
    }

    function mountHighlights() {
        const host = new DomNode();
        const doc = new DomNode();
        const body = chapter() as FakeEl & { ownerDocument: unknown; contains: (n: unknown) => boolean };
        body.ownerDocument = doc;
        body.contains = (n) => n === body;
        let selection: SelectionInfo | null = null;
        const store = { folder: () => "Lab", highlightsAbout: async () => [], write: jest.fn() };
        const highlights = new ReaderHighlights(
            { app: {} as never, host: host as never, owner: new Component(), scrollTo: jest.fn(), onChange: jest.fn() },
            { store: store as unknown as HighlightStore, selection: () => selection, headingAt: () => undefined }
        );
        const select = () => {
            selection = { start: 0, end: 14, rect: { left: 10, top: 20, width: 30 }, clear: jest.fn() };
        };
        return { highlights, host, doc, body, select };
    }

    afterEach(() => jest.useRealTimers());

    it("offers the popover when the drag ends past the chapter, in the margin", async () => {
        const m = mountHighlights();
        await m.highlights.attach(m.body as never, "a.md", new Component(), null);
        m.select();
        m.doc.fire("mouseup", { target: new DomNode() });
        expect(m.highlights.hasPopover()).toBe(true);
    });

    it("does not reopen the popover when its own button is pressed", async () => {
        const m = mountHighlights();
        await m.highlights.attach(m.body as never, "a.md", new Component(), null);
        m.select();
        m.doc.fire("mouseup", { target: new DomNode() });
        const pop = m.host.oneByClass("reader-hl-pop");
        const button = pop.find((el) => el.tag === "button")!;
        m.doc.fire("mouseup", { target: button });
        expect(m.host.oneByClass("reader-hl-pop")).toBe(pop);
    });

    it("waits for the mouse to come up before a selectionchange opens it", async () => {
        jest.useFakeTimers();
        const m = mountHighlights();
        await m.highlights.attach(m.body as never, "a.md", new Component(), null);
        m.select();
        m.doc.fire("mousedown");
        m.doc.fire("selectionchange");
        jest.advanceTimersByTime(400);
        expect(m.highlights.hasPopover()).toBe(false);
        // A touch selection has no mouse at all: it settles, then offers.
        m.doc.fire("mouseup", { target: m.body });
        m.doc.fire("selectionchange");
        jest.advanceTimersByTime(400);
        expect(m.highlights.hasPopover()).toBe(true);
    });
});
