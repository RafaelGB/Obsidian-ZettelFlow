/** #777 — a side panel closes from the panel, and the Reader's × is never mistaken for it. */
import { describe, it, expect, jest, beforeEach, afterAll } from "@jest/globals";
import { TFile, WorkspaceLeaf, __setPdfJs } from "obsidian";
import { DomNode, flush, installBrowserGlobals, settle } from "../../../../support/dashboardDom";
import { withPlatform, IPAD } from "../../../../support/platform";
import { makePdfJs, prose } from "../../../../support/fakePdf";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import { resetReaderWorkspace } from "architecture/components/core/reader/openReader";
import { ALONGSIDE_STORAGE_KEY } from "architecture/components/core/reader/readerAlongside";
import { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.name = path.split("/").pop() ?? path;
    f.extension = path.split(".").pop() ?? "";
    (f as any).stat = { size: 10, mtime: 20, ctime: 1 };
    return f;
}

const BODY = Array.from({ length: 6 }, (_, i) => `Paragraph ${i} of the chapter.`).join("\n\n");

function deps() {
    const model = new KnowledgeModel();
    model.build([]);
    return {
        index: { status: "ready", getModel: () => model },
        thoughts: async () => [],
        thoughtFolder: () => "Lab",
        judgements: { entries: () => [], record: jest.fn(() => null), remove: jest.fn() },
    };
}

/** A note reading of a.md on a stage of `size`. */
async function openNote(size = { width: 1200, height: 900 }) {
    const files: Record<string, string> = { "a.md": BODY, "b.md": "The body of B." };
    const storage: Record<string, unknown> = {};
    const app = {
        workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), iterateAllLeaves: () => undefined, setActiveLeaf: jest.fn(), trigger: jest.fn() },
        vault: {
            getAbstractFileByPath: (path: string) => (files[path] !== undefined ? file(path) : null),
            cachedRead: async (f: TFile) => files[f.path],
        },
        metadataCache: { getFirstLinkpathDest: () => null, on: () => ({}), getFileCache: () => null },
        loadLocalStorage: jest.fn((key: string) => storage[key]),
        saveLocalStorage: jest.fn((key: string, value: unknown) => {
            storage[key] = value;
        }),
    };
    const content = new DomNode();
    const leaf = new WorkspaceLeaf(app, content) as unknown as WorkspaceLeaf & { detach: jest.Mock };
    leaf.detach = jest.fn();
    const view = new ReaderView(leaf, { settings: {}, saveSettings: jest.fn(async () => undefined) }, {}, {}, deps());
    await view.setState({ seed: "a.md", kind: "selection", paths: ["a.md", "b.md"] }, {} as never);
    await view.onOpen();
    await flush();
    const root = content.oneByClass("reader") as any;
    root.getBoundingClientRect = () => ({ left: 0, top: 0, ...size });
    return { view, content, leaf, app, storage, root };
}

/** A paper: a book-like source, with Contents' tabs and the claim sheet. */
async function openPaper() {
    const { lib } = makePdfJs({ pages: [{ runs: prose(["Seth Gilbert and Nancy Lynch argue that a web service cannot be consistent."]) }], info: { Title: "Brewer's Conjecture" } });
    __setPdfJs(lib);
    const paper = file("Papers/cap.pdf");
    const app = {
        workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), iterateAllLeaves: () => undefined, setActiveLeaf: jest.fn(), trigger: jest.fn() },
        vault: {
            getAbstractFileByPath: (path: string) => (path === paper.path ? paper : null),
            readBinary: async () => new ArrayBuffer(4),
            cachedRead: async () => "",
            getAllLoadedFiles: () => [],
        },
        metadataCache: { getFirstLinkpathDest: () => null, on: () => ({}), getFileCache: () => null },
        loadLocalStorage: () => undefined,
        saveLocalStorage: jest.fn(),
    };
    const content = new DomNode();
    const leaf = new WorkspaceLeaf(app, content) as unknown as WorkspaceLeaf & { detach: jest.Mock };
    leaf.detach = jest.fn();
    const view = new ReaderView(leaf, { settings: {}, saveSettings: jest.fn(async () => undefined) }, {}, {}, deps());
    await view.setState({ source: "Papers/cap.pdf", chapter: 0 }, {} as never);
    await view.onOpen();
    await settle(() => content.byClass("reader-next").length > 0 || content.byClass("reader-pv-run").length > 0);
    return { view, content, leaf };
}

const barButton = (content: DomNode, label: string) => content.byClass("reader-bar-button").find((b) => b.getAttribute("aria-label") === label)!;
const panel = (content: DomNode) => content.oneByClass("reader-panel") as any;
const isOpen = (content: DomNode) => panel(content).hasClass("zettelkasten-flow__reader-panel--open");
const closeIn = (content: DomNode, label: string) => panel(content).find((el: DomNode) => el.hasClass("zettelkasten-flow__reader-panel-close") && el.getAttribute("aria-label") === label);
const pressed = (button: DomNode) => ({ active: button.hasClass("is-active"), pressed: button.getAttribute("aria-pressed") });

describe("a side panel closes from the panel (#777)", () => {
    afterAll(() => __setPdfJs(null));
    beforeEach(() => {
        installBrowserGlobals();
        resetReaderWorkspace();
    });

    it("closes Alongside from its head in one click, and the Reader stays open (FR-1, AC)", async () => {
        const { content, leaf, storage } = await openNote();
        barButton(content, "Alongside").click();
        await flush();
        const close = closeIn(content, "Close Alongside");
        expect(close).toBeTruthy();
        expect(close.parent.hasClass("zettelkasten-flow__reader-alongside-head")).toBe(true);
        close.click();
        await flush();
        expect(isOpen(content)).toBe(false);
        expect(leaf.detach).not.toHaveBeenCalled();
        expect(content.byClass("reader")).toHaveLength(1);
        expect(storage[ALONGSIDE_STORAGE_KEY]).toEqual({ open: false, lens: "all" });
    });

    it("closes the claim sheet first, then Alongside — the order Esc keeps (FR-1)", async () => {
        const { view, content, leaf } = await openPaper();
        barButton(content, "Alongside").click();
        await flush();
        const quote = { exact: "a web service cannot be consistent", prefix: "", suffix: "" };
        (view as any).claimLink.claim({ book: "Papers/cap.pdf", bookTitle: "Brewer's Conjecture", quote, locator: { at: 0, label: "p. 1", chapter: "0", page: "1" } }, { left: 0, top: 0, width: 10, height: 10 });
        await flush();
        expect((view as any).claimLink.isOpen()).toBe(true);
        (view as any).closeFromPanel();
        await flush();
        expect((view as any).claimLink.isOpen()).toBe(false);
        expect(isOpen(content)).toBe(true);
        closeIn(content, "Close Alongside").click();
        await flush();
        expect(isOpen(content)).toBe(false);
        expect(leaf.detach).not.toHaveBeenCalled();
    });

    it("closes Contents and Type from their own heads, in a note and in a paper (FR-1)", async () => {
        const { content } = await openNote();
        barButton(content, "Contents").click();
        closeIn(content, "Close contents").click();
        expect(isOpen(content)).toBe(false);
        barButton(content, "Type").click();
        const close = closeIn(content, "Close type");
        expect(close.parent.hasClass("zettelkasten-flow__reader-panel-head")).toBe(true);
        close.click();
        expect(isOpen(content)).toBe(false);

        const paper = await openPaper();
        barButton(paper.content, "Contents").click();
        const tabsClose = closeIn(paper.content, "Close contents");
        expect(tabsClose.parent.hasClass("zettelkasten-flow__reader-tabs")).toBe(true);
        tabsClose.click();
        expect(isOpen(paper.content)).toBe(false);
    });
});

describe("the bar says what it opens and that it is open; the exit says it closes the Reader (#777)", () => {
    beforeEach(() => {
        installBrowserGlobals();
        resetReaderWorkspace();
    });

    it("draws Alongside's button as the panel on the right (FR-3)", async () => {
        const { content } = await openNote();
        expect(barButton(content, "Alongside").getAttribute("data-icon")).toBe("panel-right");
    });

    it("follows the open panel with is-active and aria-pressed, for all three (FR-3)", async () => {
        const { content } = await openNote();
        const [contents, type, along] = ["Contents", "Type", "Alongside"].map((label) => barButton(content, label));
        for (const b of [contents, type, along]) expect(pressed(b)).toEqual({ active: false, pressed: "false" });
        along.click();
        await flush();
        expect(pressed(along)).toEqual({ active: true, pressed: "true" });
        type.click();
        expect(pressed(along)).toEqual({ active: false, pressed: "false" });
        expect(pressed(type)).toEqual({ active: true, pressed: "true" });
        contents.click();
        expect(pressed(type)).toEqual({ active: false, pressed: "false" });
        expect(pressed(contents)).toEqual({ active: true, pressed: "true" });
        contents.click();
        expect(pressed(contents)).toEqual({ active: false, pressed: "false" });
    });

    it("names the exit Close the reader, so it is never read as the panel's (FR-2)", async () => {
        const { content } = await openNote();
        expect(content.oneByClass("reader-exit").getAttribute("aria-label")).toBe("Close the reader");
    });
});

describe("on an iPad in portrait the sheet closes from its head, and the bar stays above it (#777, #750)", () => {
    beforeEach(() => {
        installBrowserGlobals();
        resetReaderWorkspace();
    });

    it("gives the sheet its close, keeps the bar reachable, and closes from either", async () => {
        await withPlatform(IPAD, async () => {
            const { view, content, root } = await openNote({ width: 820, height: 1180 });
            const along = barButton(content, "Alongside");
            along.click();
            await flush();
            expect(panel(content).hasClass("zettelkasten-flow__reader-panel--sheet")).toBe(true);
            expect(root.hasClass("zettelkasten-flow__reader--sheet")).toBe(true);
            expect(pressed(along)).toEqual({ active: true, pressed: "true" });
            // A change of type keeps the shot's states, the sheet's among them.
            (view as any).applyPrefs();
            expect(root.hasClass("zettelkasten-flow__reader--sheet")).toBe(true);
            closeIn(content, "Close Alongside").click();
            await flush();
            expect(isOpen(content)).toBe(false);
            expect(root.hasClass("zettelkasten-flow__reader--sheet")).toBe(false);
            along.click();
            await flush();
            along.click();
            await flush();
            expect(isOpen(content)).toBe(false);
        });
    });
});
