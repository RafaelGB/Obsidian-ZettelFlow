import { describe, it, expect, jest, beforeEach, afterAll } from "@jest/globals";
import { TFile, WorkspaceLeaf, __setPdfJs } from "obsidian";
import { DomNode, flush, settle } from "../../../../support/dashboardDom";
import { press } from "../../../../support/readerKeys";
import { makePdfJs, prose } from "../../../../support/fakePdf";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import { parseReaderState } from "architecture/components/core/reader/readerContract";
import { resetReaderWorkspace } from "architecture/components/core/reader/openReader";
import type { HighlightStore } from "architecture/components/core/reader/readerHighlights";
import type { Thought } from "application/thinking/thought";

/* eslint-disable @typescript-eslint/no-explicit-any */
function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.name = path.split("/").pop() ?? path;
    f.extension = path.split(".").pop() ?? "";
    (f as any).stat = { size: 10, mtime: 20, ctime: 1 };
    return f;
}

const PAPER = [
    { runs: [{ str: "Brewer's Conjecture", x: 72, y: 740, size: 18 }, ...prose(["Seth Gilbert and Nancy Lynch argue that a web service cannot be consistent,", "available and partition tolerant at once."], { top: 700 })] },
    { runs: prose(["In this section we consider the asynchronous network model, in which", "there is no clock at all."]) },
    { runs: prose(["It is impossible to implement a read/write object that guarantees", "availability and atomic consistency."]) },
];

function mount(pages = PAPER, settings: Record<string, unknown> = {}, store: Partial<HighlightStore> = {}) {
    const { lib, calls } = makePdfJs({ pages, info: { Title: "Brewer's Conjecture and the Feasibility of Web Services", Author: "Gilbert & Lynch" }, outline: [{ title: "3. Asynchronous networks", dest: [{ num: 1 }], items: [] }] });
    __setPdfJs(lib);
    const paper = file("Papers/cap.pdf");
    const app = {
        workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), iterateAllLeaves: () => undefined, setActiveLeaf: jest.fn(), trigger: jest.fn() },
        vault: {
            getAbstractFileByPath: (path: string) => (path === paper.path ? paper : null),
            readBinary: async () => new ArrayBuffer(4),
            cachedRead: async () => "",
        },
        metadataCache: { getFirstLinkpathDest: () => null, on: () => ({}) },
    };
    const content = new DomNode();
    const leaf = new WorkspaceLeaf(app, content) as unknown as WorkspaceLeaf & { detach: jest.Mock };
    leaf.detach = jest.fn();
    const host = { settings: { ...settings }, saveSettings: jest.fn(async () => undefined) };
    const thoughts: Thought[] = [];
    const memory: HighlightStore = {
        folder: () => "Lab",
        highlightsAbout: jest.fn(async (path: string) => thoughts.filter((t) => t.about === path)),
        write: jest.fn(async () => undefined),
        save: jest.fn(async () => undefined),
        discard: jest.fn(async () => undefined),
        restore: jest.fn(async () => undefined),
        ...store,
    };
    const view = new ReaderView(leaf, host, { store: memory });
    return { view, app, content, host, calls, thoughts };
}

async function open(chapter = 0, extra: Record<string, unknown> = {}, ...args: Parameters<typeof mount>) {
    const m = mount(...args);
    await m.view.setState({ source: "Papers/cap.pdf", chapter, ...extra }, {} as never);
    await m.view.onOpen();
    await settle(() => m.content.byClass("reader-next").length > 0 || m.content.byClass("reader-missing").length > 0);
    return m;
}


describe("a PDF in the Reader (#681)", () => {
    beforeEach(() => resetReaderWorkspace());
    afterAll(() => __setPdfJs(null));

    it("reads the source from the view state, and keeps only what it knows", () => {
        expect(parseReaderState({ source: "Papers/cap.pdf", chapter: 2, layout: "page" })).toEqual({ source: "Papers/cap.pdf", chapter: 2, layout: "page" });
        expect(parseReaderState({ source: "notes/a.md" })).toEqual({});
    });

    it("reflows a page into the reader's column: its pages are the chapters", async () => {
        const { content, view } = await open();
        expect(content.oneByClass("reader-path-title").textContent).toBe("Brewer's Conjecture and the Feasibility of Web Services · Gilbert & Lynch");
        expect(content.oneByClass("reader-count").textContent).toBe("Page 1 / 3");
        const body = content.oneByClass("reader-source-body");
        expect(body.findAll((el) => el.tag === "h2").map((el) => el.textContent)).toEqual(["Brewer's Conjecture"]);
        expect(body.findAll((el) => el.tag === "p")[0].textContent).toBe(
            "Seth Gilbert and Nancy Lynch argue that a web service cannot be consistent, available and partition tolerant at once."
        );
        expect(content.oneByClass("reader-next-label").textContent).toBe("Next · p. 2");
        expect(view.getDisplayText()).toBe("Reader · Brewer's Conjecture and the Feasibility of Web Services");
        expect(view.getState()).toMatchObject({ source: "Papers/cap.pdf", chapter: 0 });
    });

    it("turns pages with the reader's keys, shows the section from the outline, and keeps the place for the Library", async () => {
        const { content, host } = await open();
        press(content as never, "ArrowRight");
        await settle(() => content.oneByClass("reader-count").textContent === "Page 2 / 3");
        expect(content.oneByClass("reader-role-tag").textContent).toBe("3. Asynchronous networks");
        expect((host.settings.library as any)["Papers/cap.pdf"]).toMatchObject({ chapter: 1, chapters: 3, size: 10, mtime: 20, title: "Brewer's Conjecture and the Feasibility of Web Services" });
    });

    it("draws the page as it was laid out in page view — read-only, and says where to highlight", async () => {
        const { content, view } = await open(1, { layout: "page" });
        expect(content.byClass("reader-page-picture")).toHaveLength(1);
        expect(content.oneByClass("reader-source-hint").textContent).toContain("Highlight in the reading view.");
        expect(view.getState()).toMatchObject({ layout: "page" });
        // V, or the hint's button, goes back to the reading view.
        press(content as never, "v");
        await settle(() => content.byClass("reader-source-body")[0]?.findAll((el) => el.tag === "p").length > 0);
        expect(content.byClass("reader-source-body")[0].findAll((el) => el.tag === "p").length).toBeGreaterThan(0);
    });

    it("says a scan cannot be highlighted, before you try, and offers a note by page", async () => {
        const scan = [{ runs: [] }, { runs: [] }, { runs: [] }];
        const { content } = await open(0, {}, scan, { library: { "Papers/cap.pdf": { size: 10, mtime: 20, chapters: 3, imageOnly: true } } });
        expect(content.oneByClass("reader-source-banner-text").textContent).toBe(
            "This PDF is made of images, so there is no text to highlight. You can read it, and note in the margin by page."
        );
        expect(content.byText("Note this page")).toBeDefined();
        expect(content.byClass("reader-page-picture")).toHaveLength(1);
        // No page view to switch to: every page is already a picture.
        expect(content.byClass("reader-bar-button").some((el) => el.getAttribute("aria-label") === "Page view" && !el.hasClass("zettelkasten-flow__reader-hidden"))).toBe(false);
    });

    it("lands on the page a highlight was made on, from Think", async () => {
        const m = mount();
        m.thoughts.push({ id: "h1", at: 1, text: "", links: [], about: "Papers/cap.pdf", quote: { exact: "impossible", prefix: "", suffix: "" }, locator: { at: 2, label: "p. 3" } });
        await m.view.setState({ source: "Papers/cap.pdf", chapter: 0, highlight: "h1" }, {} as never);
        await m.view.onOpen();
        await settle(() => m.content.byClass("reader-count").some((el) => el.textContent === "Page 3 / 3"));
        expect(m.content.oneByClass("reader-count").textContent).toBe("Page 3 / 3");
    });

    it("ends a paper with what to do with what you marked", async () => {
        const { content } = await open(2);
        content.oneByClass("reader-next-button").click();
        await flush();
        expect(content.oneByClass("reader-count").textContent).toBe("The end");
        expect(content.byClass("reader-end-action-name").map((el) => el.textContent)).toEqual(["Think on what you marked", "See it in the library", "Read it again"]);
    });

    it("says so when the file cannot be read, and never throws", async () => {
        __setPdfJs(null);
        const m = mount();
        __setPdfJs(null);
        await m.view.setState({ source: "Papers/cap.pdf" }, {} as never);
        await m.view.onOpen();
        await flush();
        expect(m.content.oneByClass("reader-missing").textContent).toBe("This file could not be read.");
    });
});
