import { describe, it, expect, jest, beforeAll, afterAll, beforeEach } from "@jest/globals";
import { TFile, WorkspaceLeaf } from "obsidian";
import { DomNode, settle } from "../../../../support/dashboardDom";
import { press } from "../../../../support/readerKeys";
import { parseXml } from "../../../../support/miniXml";
import { makeEpub } from "../../../../support/zipFixture";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import { resetReaderWorkspace } from "architecture/components/core/reader/openReader";
import type { HighlightStore } from "architecture/components/core/reader/readerHighlights";

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;
const proto = (DomNode as any).prototype;

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.name = path.split("/").pop() ?? path;
    f.extension = path.split(".").pop() ?? "";
    (f as any).stat = { size: 10, mtime: 20, ctime: 1 };
    return f;
}

/** A book with a footnote in the chapter, an endnote in another, and an ordinary cross-reference. */
const BOOK = makeEpub({
    title: "A Philosophy of Software Design",
    author: "John Ousterhout",
    chapters: [
        {
            id: "c1",
            href: "text/ch1.xhtml",
            title: "4 · Deep modules",
            body:
                '<p>The Unix file calls<a epub:type="noteref" href="#fn1">1</a> hide much<a href="ch2.xhtml#n2"><sup>2</sup></a>.</p>' +
                '<p><a href="ch2.xhtml#far">see chapter 5</a></p>' +
                '<aside epub:type="footnote" id="fn1"><p>Counted on the original Unix interface.</p></aside>',
        },
        {
            id: "c2",
            href: "text/ch2.xhtml",
            title: "5 · Information hiding",
            body: '<p>Chapter five.</p><p id="far">Hiding is what makes a module deep.</p><ol><li id="n2">An endnote that lives in chapter five.</li></ol>',
        },
    ],
});

function mount() {
    const book = file("Books/aposd.epub");
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
    return { view: new ReaderView(leaf, host, { store }), content };
}

async function open() {
    const m = mount();
    await m.view.setState({ source: "Books/aposd.epub", chapter: 0 }, {} as never);
    await m.view.onOpen();
    await settle(() => m.content.byClass("reader-next").length > 0 || m.content.byClass("reader-missing").length > 0);
    return m;
}

/** Click the link whose text is `text`, the way the browser hands it to the chapter body. */
function clickLink(content: DomNode, text: string) {
    const body = content.oneByClass("reader-source-body");
    const link = body.find((el) => el.tag === "a" && el.textContent === text);
    if (!link) throw new Error(`no link "${text}"`);
    body.fire("click", { target: link });
}

const count = (content: DomNode) => content.oneByClass("reader-count").textContent;
const pill = (content: DomNode) => content.oneByClass("reader-detour-pill");

describe("footnotes read in place, and a way back after any jump (#718)", () => {
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
    beforeEach(() => resetReaderWorkspace());

    it("opens a footnote over the page, and the page does not move", async () => {
        const { content } = await open();
        clickLink(content, "1");
        await settle(() => content.byClass("reader-note-pop").length > 0);
        expect(content.oneByClass("reader-note-pop-text").textContent).toBe("Counted on the original Unix interface.");
        expect(count(content)).toBe("Chapter 1 / 2");
    });

    it("reads an endnote that lives in another chapter, without going there", async () => {
        const { content } = await open();
        clickLink(content, "2");
        await settle(() => content.byClass("reader-note-pop").length > 0);
        expect(content.oneByClass("reader-note-pop-text").textContent).toBe("An endnote that lives in chapter five.");
        expect(count(content)).toBe("Chapter 1 / 2");
    });

    it("closes the footnote with Esc, and the reader stays", async () => {
        const { content } = await open();
        clickLink(content, "1");
        await settle(() => content.byClass("reader-note-pop").length > 0);
        press(content as never, "Escape");
        expect(content.byClass("reader-note-pop")).toHaveLength(0);
        expect(content.byClass("reader-source-body")).toHaveLength(1);
    });

    it("jumps on an ordinary cross-reference, and the pill or Alt+← brings you back", async () => {
        const { content } = await open();
        clickLink(content, "see chapter 5");
        await settle(() => count(content) === "Chapter 2 / 2");
        expect(pill(content).hasClass("zettelkasten-flow__reader-hidden")).toBe(false);
        expect(pill(content).textContent).toContain("Back to");
        const evt = press(content as never, "ArrowLeft", { altKey: true });
        expect(evt.defaultPrevented).toBe(true);
        await settle(() => count(content) === "Chapter 1 / 2");
        expect(pill(content).hasClass("zettelkasten-flow__reader-hidden")).toBe(true);
    });

    it("leaves Alt+← to Obsidian when there is nowhere to go back to", async () => {
        const { content } = await open();
        const evt = press(content as never, "ArrowLeft", { altKey: true });
        expect(evt.defaultPrevented).toBe(false);
    });

    it("Go to note is a jump too, with its way back", async () => {
        const { content } = await open();
        clickLink(content, "2");
        await settle(() => content.byClass("reader-note-pop").length > 0);
        content.oneByClass("reader-note-pop-go").click();
        await settle(() => count(content) === "Chapter 2 / 2");
        expect(content.byClass("reader-note-pop")).toHaveLength(0);
        pill(content).click();
        await settle(() => count(content) === "Chapter 1 / 2");
    });
});
