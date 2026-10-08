import { describe, it, expect, jest, beforeAll, afterAll, beforeEach } from "@jest/globals";
import { TFile, WorkspaceLeaf } from "obsidian";
import { DomNode, settle } from "../../../../support/dashboardDom";
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

/** A book where *effort* is in the first and third chapters, written with and without capitals. */
const BOOK = makeEpub({
    title: "Thinking, Fast and Slow",
    author: "Daniel Kahneman",
    chapters: [
        { id: "c1", href: "text/ch1.xhtml", title: "1 · The characters", body: "<p>Effort is what System 2 spends.</p>" },
        { id: "c2", href: "text/ch2.xhtml", title: "2 · Attention", body: "<p>Nothing to find here.</p>" },
        { id: "c3", href: "text/ch3.xhtml", title: "3 · The lazy controller", body: "<p>A general law of least effort, and EFFORT again.</p>" },
    ],
});

function mount() {
    const book = file("Books/tfs.epub");
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
    await m.view.setState({ source: "Books/tfs.epub", chapter: 0 }, {} as never);
    await m.view.onOpen();
    await settle(() => m.content.byClass("reader-next").length > 0 || m.content.byClass("reader-missing").length > 0);
    return m;
}

const count = (content: DomNode) => content.oneByClass("reader-count").textContent;
const searchCount = (content: DomNode) => content.oneByClass("reader-search-count").textContent ?? "";

async function search(content: DomNode, query: string) {
    content.byClass("reader-bar-button").find((el) => el.getAttribute("aria-label") === "Search in the book")!.click();
    const input = content.oneByClass("reader-search-input");
    input.value = query;
    input.fire("input");
    await settle(() => searchCount(content).includes("result"));
    return input;
}

describe("search inside the book (#719)", () => {
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

    it("counts the matches across the whole book, whatever their case, and lists them by chapter", async () => {
        const { content } = await open();
        await search(content, "effort");
        expect(searchCount(content)).toBe("3 results · in 2 chapters");
        expect(content.byClass("reader-search-where").map((el) => el.textContent)).toEqual([
            "1 · The characters",
            "3 · The lazy controller",
            "3 · The lazy controller",
        ]);
    });

    it("steps through the matches with Enter, jumping chapters with a way back", async () => {
        const { content } = await open();
        const input = await search(content, "effort");
        input.fire("keydown", { key: "Enter" });
        expect(searchCount(content).startsWith("1 of 3")).toBe(true);
        input.fire("keydown", { key: "Enter" });
        await settle(() => count(content) === "Chapter 3 / 3");
        expect(searchCount(content).startsWith("2 of 3")).toBe(true);
        expect(content.byClass("reader-search-result--current")).toHaveLength(1);
        expect(content.oneByClass("reader-detour-pill").hasClass("zettelkasten-flow__reader-hidden")).toBe(false);
    });

    it("closes with Esc and takes every tint away; nothing else changes", async () => {
        const { content } = await open();
        const input = await search(content, "effort");
        input.fire("keydown", { key: "Escape" });
        expect(content.byClass("reader-search")).toHaveLength(0);
        expect(content.oneByClass("reader-source-body").textContent).toContain("Effort is what System 2 spends.");
    });

    it("says so when nothing matches", async () => {
        const { content } = await open();
        content.byClass("reader-bar-button").find((el) => el.getAttribute("aria-label") === "Search in the book")!.click();
        const input = content.oneByClass("reader-search-input");
        input.value = "zebra";
        input.fire("input");
        await settle(() => searchCount(content) === "No results");
        expect(content.byClass("reader-search-result")).toHaveLength(0);
    });
});
