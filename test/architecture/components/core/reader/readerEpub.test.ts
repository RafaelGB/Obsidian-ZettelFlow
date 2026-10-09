import { describe, it, expect, jest, beforeAll, afterAll, beforeEach } from "@jest/globals";
import { TFile, WorkspaceLeaf } from "obsidian";
import { DomNode, settle } from "../../../../support/dashboardDom";
import { press } from "../../../../support/readerKeys";
import { makeEpub } from "../../../../support/zipFixture";
import { parseXml } from "../../../../support/miniXml";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import { resetReaderWorkspace } from "architecture/components/core/reader/openReader";
import type { HighlightStore } from "architecture/components/core/reader/readerHighlights";

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;
const proto = DomNode.prototype as any;

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.name = path.split("/").pop() ?? path;
    f.extension = path.split(".").pop() ?? "";
    (f as any).stat = { size: 10, mtime: 20, ctime: 1 };
    return f;
}

const BOOK = makeEpub({
    title: "Thinking, Fast and Slow",
    author: "Daniel Kahneman",
    chapters: [
        { id: "c1", href: "text/ch1.xhtml", title: "1 · The characters of the story", body: '<h2>The characters</h2><p>System 1 operates <em>automatically</em>.</p><script>alert(1)</script><p><a href="ch3.xhtml#effort">see chapter 3</a> <a href="https://example.com">a website</a></p>' },
        { id: "c2", href: "text/ch2.xhtml", title: "2 · Attention and effort", body: '<p onclick="steal()" style="color:red">Effort is limited.</p><img src="../images/fig.png" alt="Figure"/>' },
        { id: "c3", href: "text/ch3.xhtml", title: "3 · The lazy controller", body: '<p id="effort">A general law of least effort.</p>' },
    ],
    extra: { "OEBPS/images/fig.png": new Uint8Array([137, 80, 78, 71]) },
});

function mount(bytes: Uint8Array = BOOK) {
    const book = file("Books/tfs.epub");
    const app = {
        workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), iterateAllLeaves: () => undefined, setActiveLeaf: jest.fn(), trigger: jest.fn() },
        vault: {
            getAbstractFileByPath: (path: string) => (path === book.path ? book : null),
            readBinary: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
            cachedRead: async () => "",
        },
        metadataCache: { getFirstLinkpathDest: () => null, on: () => ({}) },
    };
    const content = new DomNode();
    const leaf = new WorkspaceLeaf(app, content) as unknown as WorkspaceLeaf & { detach: jest.Mock };
    leaf.detach = jest.fn();
    const host = { settings: {} as Record<string, unknown>, saveSettings: jest.fn(async () => undefined) };
    const store: HighlightStore = {
        folder: () => "Lab",
        highlightsAbout: jest.fn(async () => []),
        write: jest.fn(async () => undefined),
        save: jest.fn(async () => undefined),
        discard: jest.fn(async () => undefined),
        restore: jest.fn(async () => undefined),
    };
    return { view: new ReaderView(leaf, host, { store }), content, host, app };
}

const paragraphs = (content: DomNode) => content.oneByClass("reader-source-body").findAll((el) => el.tag === "p").map((el) => el.textContent);

describe("an EPUB in the Reader (#682)", () => {
    const revoked: string[] = [];
    beforeAll(() => {
        g.DOMParser = class {
            parseFromString(text: string) {
                return { ...parseXml(text), getElementsByTagName: () => [] };
            }
        };
        // Obsidian's appendText: a text run, drawn here as a span so a test can read it.
        proto.appendText = function (this: DomNode, text: string) {
            this.createSpan({ text });
        };
        let n = 0;
        g.URL.createObjectURL = () => `blob:${++n}`;
        g.URL.revokeObjectURL = (url: string) => revoked.push(url);
    });
    afterAll(() => {
        delete g.DOMParser;
        delete proto.appendText;
    });
    beforeEach(() => resetReaderWorkspace());

    async function open(chapter = 0, bytes?: Uint8Array) {
        const m = mount(bytes);
        await m.view.setState({ source: "Books/tfs.epub", chapter }, {} as never);
        await m.view.onOpen();
        await settle(() => m.content.byClass("reader-next").length > 0 || m.content.byClass("reader-missing").length > 0);
        return m;
    }

    it("reads the spine as chapters, named from the book's own contents", async () => {
        const { content } = await open();
        expect(content.oneByClass("reader-path-title").textContent).toBe("Thinking, Fast and Slow · Daniel Kahneman");
        expect(content.oneByClass("reader-count").textContent).toBe("Chapter 1 / 3");
        expect(paragraphs(content)[0]).toBe("System 1 operates automatically.");
        expect(content.oneByClass("reader-next-label").textContent).toBe("Next · 2 · Attention and effort");
    });

    it("never draws what the book would run: no script, no handlers, no style", async () => {
        const { content } = await open(1);
        await settle(() => content.byClass("reader-source-body").length > 0);
        const body = content.oneByClass("reader-source-body");
        expect(body.findAll((el) => el.tag === "script")).toHaveLength(0);
        const p = body.find((el) => el.tag === "p");
        expect(p?.getAttribute("onclick")).toBeNull();
        expect(p?.getAttribute("style")).toBeNull();
        // The figure comes from the archive as an object URL, never from a URL in the book.
        await settle(() => body.find((el) => el.tag === "img")?.getAttribute("src") !== null);
        expect(body.find((el) => el.tag === "img")?.getAttribute("src")).toMatch(/^blob:/);
    });

    it("follows a link inside the book to its chapter, and never one that leaves it", async () => {
        const { content, app } = await open();
        const body = content.oneByClass("reader-source-body");
        const outside = body.find((el) => el.hasClass("zettelkasten-flow__reader-source-outlink"));
        expect(outside?.tag).toBe("span");
        const inside = body.find((el) => el.tag === "a") as DomNode;
        expect(inside.getAttribute("data-zf-href")).toBe("OEBPS/text/ch3.xhtml#effort");
        const event = body.fire("click", { target: inside });
        expect(event.defaultPrevented).toBe(true);
        await settle(() => content.oneByClass("reader-count").textContent === "Chapter 3 / 3");
        expect(content.oneByClass("reader-count").textContent).toBe("Chapter 3 / 3");
        expect(app.workspace.openLinkText).not.toHaveBeenCalled();
    });

    it("lets a chapter's images go when the page turns", async () => {
        const { content } = await open(1);
        await settle(() => content.oneByClass("reader-source-body").find((el) => el.tag === "img")?.getAttribute("src") !== null);
        const before = revoked.length;
        press(content as never, "ArrowRight");
        await settle(() => content.oneByClass("reader-count").textContent === "Chapter 3 / 3");
        expect(revoked.length).toBeGreaterThan(before);
    });

    it("offers the book's contents, and keeps the place for the Library", async () => {
        const { content, host } = await open();
        content.byClass("reader-bar-button").find((el) => el.getAttribute("aria-label") === "Contents")?.click();
        expect(content.byClass("reader-toc-name").map((el) => el.textContent)).toEqual([
            "1 · The characters of the story",
            "2 · Attention and effort",
            "3 · The lazy controller",
        ]);
        content.byClass("reader-toc-row")[1].click();
        await settle(() => content.oneByClass("reader-count").textContent === "Chapter 2 / 3");
        expect((host.settings.library as any)["Books/tfs.epub"]).toMatchObject({ chapter: 1, chapters: 3, title: "Thinking, Fast and Slow" });
    });

    it("reads a book written right to left as one, so its pages turn to the left (#753 FR-10)", async () => {
        const rtl = makeEpub({ title: "كتاب", direction: "rtl", chapters: [{ id: "c1", href: "text/ch1.xhtml", title: "١", body: "<p>نص</p>" }] });
        const { view, content } = await open(0, rtl);
        expect((view as any).source.direction).toBe("rtl");
        expect(content.oneByClass("reader-page").getAttribute("dir")).toBe("rtl");
        const { view: ltr, content: ltrContent } = await open();
        expect((ltr as any).source.direction).toBeUndefined();
        expect(ltrContent.oneByClass("reader-page").getAttribute("dir")).toBeNull();
    });
});
