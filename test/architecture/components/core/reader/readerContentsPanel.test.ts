import { describe, it, expect, jest, beforeAll, afterAll, beforeEach } from "@jest/globals";
import { TFile, WorkspaceLeaf } from "obsidian";
import { DomNode, settle } from "../../../../support/dashboardDom";
import { place } from "../../../../support/readerPlace";
import { makeEpub } from "../../../../support/zipFixture";
import { parseXml } from "../../../../support/miniXml";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import { resetReaderWorkspace } from "architecture/components/core/reader/openReader";
import type { HighlightStore } from "architecture/components/core/reader/readerHighlights";

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;
const proto = DomNode.prototype as any;
const PATH = "Books/rivers.epub";

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.name = path.split("/").pop() ?? path;
    f.extension = path.split(".").pop() ?? "";
    (f as any).stat = { size: 10, mtime: 20, ctime: 1 };
    return f;
}

const chapter = (i: number, body = `<p>Chapter ${i} text.</p>`) => ({ id: `c${i}`, href: `c${i}.xhtml`, title: `Item ${i}`, body });

/** Eight spine items: a cover, two parts' title pages, four chapters (two with sections), notes. */
const RIVERS = makeEpub({
    title: "The Shape of Rivers",
    author: "Ana Ferrer",
    chapters: [
        chapter(0),
        chapter(1),
        chapter(2),
        chapter(3),
        chapter(4),
        chapter(5, '<h2 id="s1">The oxbow</h2><p>Bends.</p><h2 id="s2">Slack water</h2><p>Still.</p>'),
        chapter(6, '<h2 id="f1">1953</h2><p>Flood.</p>'),
        chapter(7),
    ],
});

/** The book's own contents, nested as a book with parts nests them. */
const TOC = [
    { title: "Cover", chapter: 0, depth: 0 },
    { title: "Part One · Headwaters", chapter: 1, depth: 0 },
    { title: "1. The spring", chapter: 2, depth: 1 },
    { title: "2. What the snow remembers", chapter: 3, depth: 1 },
    { title: "Part Two · The middle course", chapter: 4, depth: 0 },
    { title: "3. Meanders", chapter: 5, depth: 1 },
    { title: "The oxbow", chapter: 5, depth: 2, fragment: "s1" },
    { title: "Slack water", chapter: 5, depth: 2, fragment: "s2" },
    { title: "4. Floods", chapter: 6, depth: 1 },
    { title: "1953", chapter: 6, depth: 2, fragment: "f1" },
    { title: "Notes", chapter: 7, depth: 0 },
];

function mount(bytes: Uint8Array) {
    const book = file(PATH);
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
        highlightsAbout: jest.fn(async () => [{ id: "h", text: "", created: "2026-10-20", about: PATH, locator: { at: 2, label: "1" }, quote: { exact: "x" } }]) as never,
        write: jest.fn(async () => undefined),
        save: jest.fn(async () => undefined),
        discard: jest.fn(async () => undefined),
        restore: jest.fn(async () => undefined),
    };
    return { view: new ReaderView(leaf, host, { store }), content, host, app };
}

const bar = (content: DomNode, label: string) => content.byClass("reader-bar-button").find((b) => b.getAttribute("aria-label") === label)!;
const bands = (content: DomNode) => content.byClass("reader-toc-band");
const rowNames = (content: DomNode) => content.byClass("reader-toc-row").map((r) => r.oneByClass("reader-toc-name").textContent);
const rowOf = (content: DomNode, name: string) => content.byClass("reader-toc-row").find((r) => r.oneByClass("reader-toc-name").textContent === name)!;
const itemOf = (content: DomNode, name: string) => rowOf(content, name).parent!;
const sectionNames = (content: DomNode) => content.byClass("reader-toc-section").map((s) => s.textContent);

describe("Contents with the book's shape (#861)", () => {
    beforeAll(() => {
        g.DOMParser = class {
            parseFromString(text: string) {
                return { ...parseXml(text), getElementsByTagName: () => [] };
            }
        };
        proto.appendText = function (this: DomNode, text: string) {
            this.createSpan({ text });
        };
        g.URL.createObjectURL = () => "blob:1";
        g.URL.revokeObjectURL = () => undefined;
    });
    afterAll(() => {
        delete g.DOMParser;
        delete proto.appendText;
    });
    beforeEach(() => resetReaderWorkspace());

    async function open(at = 5, toc: typeof TOC | null = TOC, bytes = RIVERS) {
        const m = mount(bytes);
        await m.view.setState({ source: PATH, chapter: at }, {} as never);
        await m.view.onOpen();
        await settle(() => m.content.byClass("reader-next").length > 0 || m.content.byClass("reader-end").length > 0);
        if (toc) (m.view as any).source.toc = toc;
        bar(m.content, "Contents").click();
        return m;
    }

    it("names the book in its head, its actions and × after it, its tabs on a line of their own (FR-1 – FR-4)", async () => {
        const { content } = await open();
        const head = content.oneByClass("reader-contents-head");
        expect(head.oneByClass("reader-contents-title").textContent).toBe("The Shape of Rivers");
        expect(head.oneByClass("reader-contents-author").textContent).toBe("Ana Ferrer");
        // No cover drawn by the Library this session: the plain tile, never a read of the file for one.
        expect(head.oneByClass("reader-contents-cover").hasClass("zettelkasten-flow__reader-contents-cover--tile")).toBe(true);
        expect(head.oneByClass("reader-contents-cover").textContent).toBe("epub");
        expect(head.oneByClass("reader-panel-actions").byClass("reader-panel-action").map((b) => b.getAttribute("aria-label"))).toContain("Notebook");
        expect(head.children.at(-1)?.hasClass("zettelkasten-flow__reader-panel-close")).toBe(true);
        // The tabs are not in the head, and say no number.
        const tabs = content.oneByClass("reader-tabs");
        expect(head.contains(tabs)).toBe(false);
        expect(tabs.byClass("reader-tab").map((b) => [b.textContent, b.getAttribute("aria-selected")])).toEqual([
            ["Contents", "true"],
            ["Bookmarks", "false"],
            ["Where you've been", "false"],
        ]);
        expect(/\d/.test(tabs.textContent)).toBe(false);
        // One underline, under the chosen tab.
        expect(tabs.byClass("reader-tab-ink")).toHaveLength(1);
        expect(tabs.byClass("reader-tab")[0].byClass("reader-tab-ink")).toHaveLength(1);
        // No second progress signal in the panel (decision 2).
        expect(content.oneByClass("reader-contents").byClass("reader-scrubber")).toHaveLength(0);
        expect(content.oneByClass("reader-contents").byClass("reader-progress")).toHaveLength(0);
    });

    it("draws parts as bands, front and back matter folded, the number in its own column (FR-5, FR-8, FR-9)", async () => {
        const { content } = await open();
        expect(bands(content).map((b) => [b.textContent, b.getAttribute("aria-expanded")])).toEqual([
            ["Front matter", "false"],
            ["Part One · Headwaters", "true"],
            ["Part Two · The middle course", "true"],
            ["Back matter", "false"],
        ]);
        expect(rowNames(content)).toEqual(["The spring", "What the snow remembers", "Meanders", "Floods"]);
        expect(content.byClass("reader-toc-num").map((n) => n.textContent)).toEqual(["1", "2", "3", "4"]);
        // A reflowed book has no page to point at.
        expect(content.byClass("reader-toc-page")).toHaveLength(0);
        expect(content.byClass("reader-toc-role")).toHaveLength(0);
    });

    it("opens the matter you are in", async () => {
        const { content } = await open(0);
        expect(bands(content)[0].getAttribute("aria-expanded")).toBe("true");
        expect(rowOf(content, "Cover").getAttribute("aria-current")).toBe("step");
    });

    it("says you're here on your chapter, its sections open, and the rail's states around it (FR-11 – FR-13)", async () => {
        const { content } = await open();
        const here = rowOf(content, "Meanders");
        expect(here.getAttribute("aria-current")).toBe("step");
        expect(here.oneByClass("reader-toc-here").textContent).toMatch(/^You're here/);
        expect(content.byClass("reader-toc-here")).toHaveLength(1);
        expect(itemOf(content, "Meanders").hasClass("zettelkasten-flow__reader-toc-item--current")).toBe(true);
        // Its sections are shown; the next chapter's are folded behind its caret.
        expect(sectionNames(content)).toEqual(["The oxbow", "Slack water"]);
        expect(itemOf(content, "Floods").oneByClass("reader-toc-caret").getAttribute("aria-expanded")).toBe("false");
        const state = (name: string) => ["read", "part", "unread"].find((s) => rowOf(content, name).hasClass(`zettelkasten-flow__reader-toc-row--${s}`));
        expect(["The spring", "Meanders", "Floods"].map(state)).toEqual(["read", "part", "unread"]);
        expect(rowOf(content, "Floods").getAttribute("aria-label")).toBe("4 Floods · Not read yet");
        // Never a number for how far it is read.
        expect(content.byClass("reader-toc-state").every((s) => s.textContent === "")).toBe(true);
    });

    it("unfolds a chapter's sections from its caret without leaving the page, and jumps from a section (FR-11, FR-15)", async () => {
        const { content } = await open();
        itemOf(content, "Floods").oneByClass("reader-toc-caret").click();
        expect(sectionNames(content)).toEqual(["The oxbow", "Slack water", "1953"]);
        expect(place(content)).toBe("Chapter 6 / 8");
        content.byClass("reader-toc-section").find((s) => s.textContent === "1953")!.click();
        await settle(() => place(content) === "Chapter 7 / 8");
        expect(place(content)).toBe("Chapter 7 / 8");
        if (content.byClass("reader-tabs").length === 0) bar(content, "Contents").click();
        content.byClass("reader-tab").find((b) => b.textContent === "Where you've been")!.click();
        expect(content.byClass("reader-trail-reason").map((r) => r.textContent)).toContain("Before Contents");
    });

    it("folds a part, and keeps it folded when Contents opens again (FR-7)", async () => {
        const { content } = await open();
        bands(content)[1].click();
        expect(bands(content)[1].getAttribute("aria-expanded")).toBe("false");
        expect(rowNames(content)).toEqual(["Meanders", "Floods"]);
        bar(content, "Contents").click();
        bar(content, "Contents").click();
        expect(bands(content)[1].getAttribute("aria-expanded")).toBe("false");
        bands(content)[1].click();
        expect(rowNames(content)).toEqual(["The spring", "What the snow remembers", "Meanders", "Floods"]);
    });

    it("puts one mark beside the chapters you marked something in (FR-14)", async () => {
        const { content } = await open();
        await settle(() => content.byClass("reader-toc-mark").length > 0);
        const marked = content.byClass("reader-toc-row").filter((r) => r.byClass("reader-toc-mark").length > 0);
        expect(marked.map((r) => r.oneByClass("reader-toc-name").textContent)).toEqual(["The spring"]);
        expect(marked[0].oneByClass("reader-toc-loc").byClass("reader-toc-mark")).toHaveLength(1);
        expect(marked[0].getAttribute("aria-label")).toContain("You marked something here");
        // Folding redraws the list: the mark is drawn again at once.
        bands(content)[2].click();
        expect(rowOf(content, "The spring").byClass("reader-toc-mark")).toHaveLength(1);
    });

    it("moves between rows and bands with the arrow keys (FR-17)", async () => {
        const { content } = await open();
        const list = content.oneByClass("reader-toc-list");
        const buttons = list.findAll((el) => el.tag === "button");
        const focused: DomNode[] = [];
        for (const b of buttons) (b as any).focus = () => focused.push(b);
        list.fire("keydown", { key: "ArrowDown", target: buttons[0] });
        list.fire("keydown", { key: "ArrowUp", target: buttons[2] });
        expect(focused).toEqual([buttons[1], buttons[1]]);
    });

    it("says where each entry starts in a paper, beside its title (FR-10)", async () => {
        const m = await open(5, null);
        const source = (m.view as any).source;
        source.format = "pdf";
        source.toc = [
            { title: "1 Introduction", chapter: 0, depth: 0 },
            { title: "3 Method", chapter: 4, depth: 0 },
            { title: "3.1 Memory slots", chapter: 5, depth: 1 },
            { title: "3.2 The router", chapter: 6, depth: 1 },
        ];
        source.pages = { label: (i: number) => (i === 0 ? "iv" : String(i + 10)) };
        bar(m.content, "Contents").click();
        bar(m.content, "Contents").click();
        expect(bands(m.content)).toHaveLength(0);
        expect(m.content.byClass("reader-toc-row").map((r) => [r.oneByClass("reader-toc-num").textContent, r.oneByClass("reader-toc-name").textContent, r.oneByClass("reader-toc-loc").textContent])).toEqual([
            ["1", "Introduction", "iv"],
            ["3", "Method", "14"],
        ]);
        // Page 15 starts 3.1: the section you are in, lit under the chapter you are in.
        expect(m.content.byClass("reader-toc-section").map((s) => [s.textContent, s.getAttribute("aria-current")])).toEqual([
            ["3.1 Memory slots15", "location"],
            ["3.2 The router16", null],
        ]);
    });

    it("groups bookmarks under the parts they are in, as cards (FR-18)", async () => {
        const m = mount(RIVERS);
        m.host.settings.library = {
            [PATH]: {
                size: 10,
                mtime: 20,
                chapter: 5,
                chapters: 8,
                title: "The Shape of Rivers",
                bookmarks: [
                    { chapter: 2, offset: 0, at: 1, quote: { exact: "Chapter 2 text." } },
                    { chapter: 5, offset: 0, at: 2, quote: { exact: "Bends." } },
                    { chapter: 6, offset: 0, at: 3, quote: { exact: "Flood." } },
                ],
            },
        };
        await m.view.setState({ source: PATH, chapter: 5 }, {} as never);
        await m.view.onOpen();
        await settle(() => m.content.byClass("reader-next").length > 0);
        (m.view as any).source.toc = TOC;
        bar(m.content, "Contents").click();
        m.content.byClass("reader-tab").find((b) => b.textContent === "Bookmarks")!.click();
        const list = m.content.oneByClass("reader-tab-list");
        expect(list.children.map((el) => (el.hasClass("zettelkasten-flow__reader-mark-group") ? `# ${el.textContent}` : "card"))).toEqual([
            "# Part One · Headwaters",
            "card",
            "# Part Two · The middle course",
            "card",
            "card",
        ]);
    });

    describe("Find in contents (FR-16)", () => {
        const LONG = Array.from({ length: 30 }, (_, i) => ({ title: i === 12 ? "Évora and the water" : `Chapter about stone ${i}`, chapter: Math.min(i, 7), depth: 0 }));

        it("is offered only when the contents are long", async () => {
            expect((await open()).content.byClass("reader-contents-find")).toHaveLength(0);
            expect((await open(5, LONG)).content.byClass("reader-contents-find")).toHaveLength(1);
        });

        it("keeps what matches, whatever the accents, marks the match, says when nothing does, and restores the list", async () => {
            const { content } = await open(5, LONG);
            const field = content.oneByClass("reader-contents-find").find((el) => el.tag === "input")!;
            expect(field.getAttribute("placeholder")).toBe("Find in contents");
            field.value = "evora";
            field.fire("input");
            expect(rowNames(content)).toEqual(["Évora and the water"]);
            expect(content.oneByClass("reader-toc-hit").textContent).toBe("Évora");
            field.value = "zzzz";
            field.fire("input");
            expect(content.byClass("reader-toc-row")).toHaveLength(0);
            expect(content.oneByClass("reader-toc-list").oneByClass("reader-empty").textContent).toBe("Nothing in the contents is called “zzzz”.");
            field.value = "";
            field.fire("input");
            expect(content.byClass("reader-toc-row")).toHaveLength(30);
        });
    });
});
