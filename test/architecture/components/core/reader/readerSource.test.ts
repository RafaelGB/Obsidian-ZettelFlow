import { describe, it, expect, jest, beforeEach, afterAll } from "@jest/globals";
import { TFile, WorkspaceLeaf, __setPdfJs } from "obsidian";
import { DomNode, flush, settle } from "../../../../support/dashboardDom";
import { place } from "../../../../support/readerPlace";
import { press } from "../../../../support/readerKeys";
import { makePdfJs, prose } from "../../../../support/fakePdf";
import { LOGO, grid, image, opList } from "../../../../support/pdfPrintPaper";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import { parseReaderState } from "architecture/components/core/reader/readerContract";
import { resetReaderWorkspace } from "architecture/components/core/reader/openReader";
import { DEVICE_LIMITS } from "architecture/components/core/reader/readerDevice";
import { openPdfSource } from "architecture/components/core/library/sources/pdfSource";
import { withPlatform, IPAD } from "../../../../support/platform";
import type { HighlightStore } from "architecture/components/core/reader/readerHighlights";
import type { Thought } from "application/thinking/thought";

/* eslint-disable @typescript-eslint/no-explicit-any */
const cls = (name: string) => `zettelkasten-flow__${name}`;

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
        expect(parseReaderState({ source: "notes/a.txt" })).toEqual({});
        // An article is a note read as a source (#744).
        expect(parseReaderState({ source: "Clippings/a.md" })).toEqual({ source: "Clippings/a.md" });
    });

    it("reflows a page into the reader's column: its pages are the chapters", async () => {
        const { content, view } = await open();
        expect(content.oneByClass("reader-path-title").textContent).toBe("Brewer's Conjecture and the Feasibility of Web Services · Gilbert & Lynch");
        expect(place(content)).toBe("Page 1 / 3");
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
        await settle(() => place(content) === "Page 2 / 3");
        expect(content.oneByClass("reader-role-tag").textContent).toBe("3. Asynchronous networks");
        // The place and what was read off the file are written a moment later — wait for them, not a tick.
        await settle(() => (host.settings.library as any)?.["Papers/cap.pdf"]?.chapter === 1 && Boolean((host.settings.library as any)?.["Papers/cap.pdf"]?.title));
        expect((host.settings.library as any)["Papers/cap.pdf"]).toMatchObject({ chapter: 1, chapters: 3, size: 10, mtime: 20, title: "Brewer's Conjecture and the Feasibility of Web Services" });
    });

    it("draws the page as it was laid out in page view — read-only, and says where to highlight", async () => {
        const { content, view } = await open(1, { layout: "page" });
        expect(content.byClass("reader-pv-run")).toHaveLength(1);
        expect(content.oneByClass("reader-source-hint").textContent).toContain("Select words to highlight them; the pen draws here.");
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
        expect(content.byClass("reader-pv-run")).toHaveLength(1);
        // No page view to switch to: every page is already a picture.
        expect(content.byClass("reader-bar-button").some((el) => el.getAttribute("aria-label") === "Page view" && !el.hasClass("zettelkasten-flow__reader-hidden"))).toBe(false);
    });

    it("lands on the page a highlight was made on, from Think", async () => {
        const m = mount();
        m.thoughts.push({ id: "h1", at: 1, text: "", links: [], about: "Papers/cap.pdf", quote: { exact: "impossible", prefix: "", suffix: "" }, locator: { at: 2, label: "p. 3" } });
        await m.view.setState({ source: "Papers/cap.pdf", chapter: 0, highlight: "h1" }, {} as never);
        await m.view.onOpen();
        await settle(() => place(m.content) === "Page 3 / 3");
        expect(place(m.content)).toBe("Page 3 / 3");
    });

    it("ends a paper with what to do with what you marked", async () => {
        const { content } = await open(2);
        content.oneByClass("reader-next-button").click();
        await flush();
        expect(place(content)).toBe("The end");
        expect(content.byClass("reader-end-action-name").map((el) => el.textContent)).toEqual(["Think on what you marked", "See it in the library", "Read it again"]);
    });

    it("keeps how far into the page you are, so a resume lands there and not at its top", async () => {
        const { content, host } = await open(1);
        const stage = content.oneByClass("reader-stage") as DomNode & { scrollHeight: number; clientHeight: number };
        stage.scrollHeight = 3000;
        stage.clientHeight = 1000;
        stage.scrollTop = 1000;
        stage.fire("scroll");
        await settle(() => (host.settings.library as any)?.["Papers/cap.pdf"]?.scroll === 0.5, 200, 2500);
        expect((host.settings.library as any)["Papers/cap.pdf"]).toMatchObject({ chapter: 1, scroll: 0.5 });
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

/** A big book opens, or says why not (#750 FR-13, FR-23, AC-10). */
describe("a source too large for the device (#750)", () => {
    beforeEach(() => resetReaderWorkspace());
    afterAll(() => __setPdfJs(null));

    function big(m: ReturnType<typeof mount>) {
        const paper = m.app.vault.getAbstractFileByPath("Papers/cap.pdf") as unknown as { stat: { size: number } };
        paper.stat.size = DEVICE_LIMITS.pdf + 1;
        const readBinary = jest.fn(async () => new ArrayBuffer(4));
        (m.app.vault as unknown as { readBinary: unknown }).readBinary = readBinary;
        return readBinary;
    }

    it("is not read at all on an iPad: one calm line, and the way back to the shelf; nothing is written", async () => {
        await withPlatform(IPAD, async () => {
            const m = mount();
            const readBinary = big(m);
            const back = { focus: "Papers/cap.pdf" };
            (m.app.workspace as unknown as { getLeavesOfType: unknown }).getLeavesOfType = () => [];
            const setViewState = jest.fn(async () => undefined);
            (m.view.leaf as unknown as { setViewState: unknown }).setViewState = setViewState;
            await m.view.setState({ source: "Papers/cap.pdf", chapter: 0, back }, {} as never);
            await m.view.onOpen();
            await flush();
            expect(readBinary).not.toHaveBeenCalled();
            expect(m.content.oneByClass("reader-too-large-text").textContent).toBe("This file is too large to open on this device.");
            const shelf = m.content.byText("Back to the library");
            expect(shelf).toBeDefined();
            shelf!.click();
            expect(setViewState).toHaveBeenCalledWith({ type: "zettelflow-library", state: back, active: true });
            expect(m.host.saveSettings).not.toHaveBeenCalled();
            expect(m.host.settings.library).toBeUndefined();
        });
    });

    it("opens the same file on a desktop, where there is no such limit — saying Opening… meanwhile", async () => {
        const m = mount();
        const readBinary = big(m);
        await m.view.setState({ source: "Papers/cap.pdf", chapter: 0 }, {} as never);
        await m.view.onOpen();
        await settle(() => m.content.byClass("reader-next").length > 0);
        expect(readBinary).toHaveBeenCalled();
        expect(m.content.byClass("reader-too-large")).toHaveLength(0);
    });

    it("says Opening… while a book within the limit opens on an iPad", async () => {
        await withPlatform(IPAD, async () => {
            const m = mount();
            let release: () => void = () => undefined;
            (m.app.vault as unknown as { readBinary: unknown }).readBinary = () => new Promise<ArrayBuffer>((resolve) => (release = () => resolve(new ArrayBuffer(4))));
            const opening = m.view.setState({ source: "Papers/cap.pdf", chapter: 0 }, {} as never);
            await flush(2);
            await m.view.onOpen();
            expect(m.content.oneByClass("reader-missing").textContent).toBe("Opening…");
            release();
            await opening;
            await settle(() => m.content.byClass("reader-next").length > 0);
            expect(m.content.byClass("reader-too-large")).toHaveLength(0);
        });
    });
});

describe("a PDF opens without reading its first pages again (#851 FR-2, AC-3, AC-4)", () => {
    beforeEach(() => resetReaderWorkspace());
    afterAll(() => __setPdfJs(null));

    const known = (mtime: number) => ({ library: { "Papers/cap.pdf": { size: 10, mtime, chapters: 3, suggestedView: "reading", typewritten: false, furniture: [] } } });

    it("reads no page's text but the one it draws, when the Library remembers this copy", async () => {
        const { calls, content } = await open(0, {}, PAPER, known(20));
        await settle(() => content.byClass("reader-source-body").length > 0);
        expect(calls.textReads).toEqual([1]);
    });

    it("samples a copy it does not know as before, and remembers what it read", async () => {
        const { calls, host } = await open(0, {}, PAPER, known(99));
        expect(calls.textReads.slice(0, 3)).toEqual([1, 2, 3]);
        await settle(() => (host.settings.library as any)?.["Papers/cap.pdf"]?.mtime === 20);
        expect((host.settings.library as any)["Papers/cap.pdf"]).toMatchObject({ size: 10, mtime: 20, suggestedView: "reading", typewritten: false });
    });

    it("samples once more a copy remembered before it kept whether it is typewritten", async () => {
        const { calls, host } = await open(0, {}, PAPER, { library: { "Papers/cap.pdf": { size: 10, mtime: 20, chapters: 3, suggestedView: "reading" } } });
        expect(calls.textReads.slice(0, 3)).toEqual([1, 2, 3]);
        await settle(() => (host.settings.library as any)?.["Papers/cap.pdf"]?.typewritten === false);
        expect((host.settings.library as any)["Papers/cap.pdf"].typewritten).toBe(false);
    });
});

describe("a designed PDF opens as printed, and the reading view says what it leaves out (#852)", () => {
    beforeEach(() => resetReaderWorkspace());
    afterAll(() => __setPdfJs(null));

    const withOps = (...lists: (ReturnType<typeof opList> | undefined)[]) => PAPER.map((page, i) => (lists[i] ? { ...page, ops: lists[i] } : page));
    const note = (content: DomNode) => content.byClass("reader-source-leftout").find((el) => !el.hasClass(cls("reader-hidden")));

    it("opens a document with its logo on every page in Page view (AC-1)", async () => {
        const { view } = await open(0, {}, withOps(opList(LOGO), opList(LOGO), opList(LOGO)));
        expect((view as any).sourceView).toBe("page");
    });

    it("opens a paper with a figure on one page reflowed, as before (AC-1)", async () => {
        const { view } = await open(0, {}, withOps(undefined, opList(image(72, 300, 400, 250))));
        expect((view as any).sourceView).toBe("reading");
    });

    it("says under a reflowed page what it leaves out, and takes you to Page view on the same page (AC-2)", async () => {
        // In Page, the view on show is the page asked for: the fake DOM has no scroll to say it.
        const { content, view } = await open(1, { layout: "reading" }, withOps(undefined, opList(LOGO, image(100, 100, 400, 300))), { readerPrefs: { layout: "page" } });
        await settle(() => Boolean(note(content)));
        expect(note(content)!.find((el) => el.tag === "span")!.textContent).toBe("Leaves out 2 pictures and the page's layout.");
        const button = note(content)!.find((el) => el.tag === "button")!;
        expect(button.textContent).toBe("Page view");
        button.click();
        await settle(() => (view as any).sourceView === "page" && place(content) === "Page 2 / 3");
        expect(place(content)).toBe("Page 2 / 3");
    });

    it("names a ruled table too, and counts one picture as one", async () => {
        const { content } = await open(0, { layout: "reading" }, withOps(opList(LOGO, grid(500, 4, 3))));
        await settle(() => Boolean(note(content)));
        expect(note(content)!.find((el) => el.tag === "span")!.textContent).toBe("Leaves out 1 picture, its tables and the page's layout.");
    });

    it("says nothing on a page that leaves nothing out (AC-3)", async () => {
        const { content } = await open(0, { layout: "reading" });
        await flush();
        expect(note(content)).toBeUndefined();
    });
});

describe("a PDF's running heads and footers are not its text (#853 AC-1)", () => {
    beforeEach(() => resetReaderWorkspace());
    afterAll(() => __setPdfJs(null));

    const furnished = Array.from({ length: 8 }, (_, i) => ({
        runs: [
            { str: "Acme SMS API - Developer guide", x: 300, y: 760, size: 12 },
            ...prose([`Page ${i + 1} explains how a message is sent to the platform,`, "and what it answers when the request is wrong."], { top: 600 }),
            { str: `Confidencial — Página ${i + 1} de 8`, x: 72, y: 40, size: 8 },
        ],
    }));

    it("leaves them out of every page, and the Library remembers them", async () => {
        const { content, host } = await open(4, { layout: "reading" }, furnished);
        await settle(() => content.byClass("reader-source-body").length > 0);
        const text = content.oneByClass("reader-source-body").textContent;
        expect(text).toContain("Page 5 explains how a message is sent");
        expect(text).not.toContain("Acme SMS API - Developer");
        expect(text).not.toContain("Página");
        await settle(() => Boolean((host.settings.library as any)?.["Papers/cap.pdf"]?.furniture));
        expect((host.settings.library as any)["Papers/cap.pdf"].furniture).toHaveLength(2);
    });
});

describe("a PDF's printed pages, behind the source seam (#767)", () => {
    afterAll(() => __setPdfJs(null));

    async function pagesOf(pdf: Parameters<typeof makePdfJs>[0]) {
        const { lib, calls } = makePdfJs(pdf);
        __setPdfJs(lib);
        const paper = file("Papers/p.pdf");
        const app = { vault: { readBinary: async () => new ArrayBuffer(4), getAbstractFileByPath: () => paper } };
        const doc = await openPdfSource(app as never, paper);
        return { doc, pages: doc.pages!, calls };
    }

    it("names each page by the paper's own label, and the chapters with it", async () => {
        const { doc, pages } = await pagesOf({ pages: [{ runs: [] }, { runs: [] }, { runs: [] }], labels: ["i", "1", "2"] });
        expect([0, 1, 2].map((i) => pages.label(i))).toEqual(["i", "1", "2"]);
        expect(doc.chapters.map((chapter) => chapter.label)).toEqual(["p. i", "p. 1", "p. 2"]);
        // Labels that only repeat the numbers say nothing more.
        const plain = await pagesOf({ pages: [{ runs: [] }, { runs: [] }], labels: ["1", "2"] });
        expect(plain.pages.label(1)).toBe("2");
    });

    it("reads a page's size, draws it at a scale and a turn, and can let a drawing go", async () => {
        const { pages, calls } = await pagesOf({ pages: [{ runs: [] }, { runs: [], width: 792, height: 612 }], holdRenders: true });
        expect(pages.first).toEqual({ width: 612, height: 792 });
        expect(await pages.size(1)).toEqual({ width: 792, height: 612 });
        const canvas = { width: 0, height: 0, getContext: () => ({}) } as unknown as HTMLCanvasElement;
        const task = pages.render(0, canvas, { scale: 2, rotation: 90 });
        await flush();
        expect(calls.renders[0]).toMatchObject({ page: 1, scale: 2, rotation: 90 });
        // Turned a quarter: the canvas is as wide as the page is tall.
        expect([canvas.width, canvas.height]).toEqual([1584, 1224]);
        task.cancel();
        await expect(task.promise).resolves.toBeUndefined();
        expect(calls.renders[0].cancelled).toBe(true);
    });

    it("finds a page's links, as shares of the page, and where the ones in the paper go", async () => {
        const { pages } = await pagesOf({
            pages: [
                {
                    runs: [],
                    links: [
                        { rect: [61.2, 712.8, 122.4, 792], dest: "refs" },
                        { rect: [0, 0, 306, 79.2], url: "https://example.org/a" },
                    ],
                },
                { runs: [] },
            ],
            destinations: { refs: [{ num: 1 }, { name: "XYZ" }, 0, 396, 0] },
        });
        const links = await pages.links(0, 0);
        expect(links[0].rect.x).toBeCloseTo(0.1);
        expect(links[0].rect.y).toBeCloseTo(0);
        expect(links[0].rect.w).toBeCloseTo(0.1);
        expect(links[0].rect.h).toBeCloseTo(0.1);
        expect(links[1]).toMatchObject({ url: "https://example.org/a" });
        expect(links[1].rect.y).toBeCloseTo(0.9);
        expect(await pages.destination(links[0].dest)).toEqual({ page: 1, share: 0.5 });
        expect(await pages.destination("nowhere")).toBeNull();
        // Turned a quarter, a link is where the turned page shows it.
        const turned = await pages.links(0, 90);
        expect(turned[1].rect.x).toBeCloseTo(0);
        expect(turned[1].rect.w).toBeCloseTo(0.1);
    });
});
