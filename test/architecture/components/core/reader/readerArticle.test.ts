import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { MarkdownRenderer, TFile, WorkspaceLeaf } from "obsidian";
import { DomNode, settle } from "../../../../support/dashboardDom";
import { place } from "../../../../support/readerPlace";
import { press } from "../../../../support/readerKeys";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import { resetReaderWorkspace } from "architecture/components/core/reader/openReader";
import { ReaderHighlights, type HighlightStore } from "architecture/components/core/reader/readerHighlights";
import { openSourceDocument } from "architecture/components/core/library/sources/sourceDocument";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * **An article in the Reader** (#744 FR-5, FR-10, AC-4, AC-5): a clipping read like a book — its
 * headings are its sections, Contents lists them, the place is the Library's — and the note is only
 * ever read.
 */
const PATH = "Clippings/The case for slow software.md";
const FRONTMATTER = {
    title: "The case for slow software",
    source: "https://example.com/slow-software",
    author: ["[[Jane Doe]]"],
    published: "2025-03-02",
    created: "2025-03-04",
    tags: ["clippings"],
    // Web Clipper's `lang`: the column and Listen's voice read by it (#765).
    lang: "en-GB",
};
const NOTE = [
    "---",
    "title: The case for slow software",
    "source: https://example.com/slow-software",
    'author:\n  - "[[Jane Doe]]"',
    "published: 2025-03-02",
    "created: 2025-03-04",
    "tags:\n  - clippings",
    "---",
    "Software got fast. Then it got slow again.",
    "",
    "## Speed",
    "",
    "Every millisecond is a promise.",
    "",
    "### Measured",
    "",
    "We measured it.",
    "",
    "## Care",
    "",
    "Care is slow on purpose.",
    "",
].join("\n");

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.name = path.split("/").pop() ?? path;
    f.basename = f.name.replace(/\.md$/, "");
    f.extension = "md";
    (f as any).stat = { size: NOTE.length, mtime: 20, ctime: 1 };
    return f;
}

function mount(settings: Record<string, unknown> = {}) {
    const note = file(PATH);
    const contents = new Map([[PATH, NOTE]]);
    const vault = {
        getAbstractFileByPath: (path: string) => (path === PATH ? note : null),
        cachedRead: jest.fn(async (f: TFile) => contents.get(f.path) ?? ""),
        read: jest.fn(async (f: TFile) => contents.get(f.path) ?? ""),
        modify: jest.fn(),
        process: jest.fn(),
        create: jest.fn(),
        append: jest.fn(),
    };
    const fileManager = { processFrontMatter: jest.fn(), renameFile: jest.fn() };
    const app = {
        workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), iterateAllLeaves: () => undefined, setActiveLeaf: jest.fn(), trigger: jest.fn() },
        vault,
        fileManager,
        metadataCache: { getFileCache: (f: TFile) => (f.path === PATH ? { frontmatter: FRONTMATTER } : null), getFirstLinkpathDest: () => null, on: () => ({}) },
    };
    const content = new DomNode();
    const leaf = new WorkspaceLeaf(app, content) as unknown as WorkspaceLeaf & { detach: jest.Mock };
    leaf.detach = jest.fn();
    const host = { settings: { ...settings } as Record<string, unknown>, saveSettings: jest.fn(async () => undefined) };
    const store: HighlightStore = {
        folder: () => "Lab",
        highlightsAbout: jest.fn(async () => []),
        write: jest.fn(async () => undefined),
        save: jest.fn(async () => undefined),
        discard: jest.fn(async () => undefined),
        restore: jest.fn(async () => undefined),
    } as unknown as HighlightStore;
    return { view: new ReaderView(leaf, host, { store }), content, host, app, vault, fileManager, contents, store };
}

async function open(chapter = 0, settings: Record<string, unknown> = {}) {
    const m = mount(settings);
    await m.view.setState({ source: PATH, chapter }, {} as never);
    await m.view.onOpen();
    await settle(() => m.content.byClass("reader-next").length > 0 || m.content.byClass("reader-missing").length > 0);
    return m;
}

const count = (content: DomNode) => place(content);

describe("an article in the Reader (#744)", () => {
    let attach: jest.SpiedFunction<ReaderHighlights["attach"]>;
    beforeEach(() => {
        resetReaderWorkspace();
        MarkdownRenderer.calls = [];
        attach = jest.spyOn(ReaderHighlights.prototype, "attach");
    });
    afterEach(() => attach.mockRestore());

    it("draws its first section through Obsidian's renderer, without its properties, named after the article", async () => {
        const { content } = await open();
        expect(content.oneByClass("reader-path-title").textContent).toBe("The case for slow software · Jane Doe");
        expect(count(content)).toBe("Section 1 / 3");
        // The bar says it the same way.
        expect(content.oneByClass("reader-bar-label").textContent).toBe("Section 1 / 3");
        const drawn = MarkdownRenderer.calls.filter((call) => call.sourcePath === PATH);
        expect(drawn[0].markdown).toBe("Software got fast. Then it got slow again.\n");
        expect(drawn[0].markdown).not.toContain("source:");
        expect(content.oneByClass("reader-source-body").hasClass("zettelkasten-flow__reader-source-body--article")).toBe(true);
        expect(content.oneByClass("reader-next-label").textContent).toBe("Next · Speed");
        // The language it says it is in: the column declares it (#765, for Listen's voice).
        expect(content.oneByClass("reader-source-body").getAttribute("lang")).toBe("en-GB");
    });

    it("lists its headings in Contents, and goes to a section from there", async () => {
        const { content } = await open();
        content.byClass("reader-bar-button").find((el) => el.getAttribute("aria-label") === "Contents")?.click();
        expect(content.byClass("reader-toc-name").map((el) => el.textContent)).toEqual(["The case for slow software", "Speed", "Measured", "Care"]);
        content.byClass("reader-toc-row")[3].click();
        await settle(() => count(content) === "Section 3 / 3");
        expect(count(content)).toBe("Section 3 / 3");
    });

    it("has no Page view: an article reflows, like an EPUB", async () => {
        const { content } = await open();
        const view = content.byClass("reader-bar-button").filter((el) => el.getAttribute("aria-label") === "Page view");
        expect(view).toHaveLength(1);
        expect(view[0].hasClass("zettelkasten-flow__reader-hidden")).toBe(true);
    });

    it("marks its passages as thoughts about the clipping, at their section — through the thought store only", async () => {
        const { content } = await open(1);
        await settle(() => attach.mock.calls.some((call) => call[1] === PATH));
        const call = attach.mock.calls.find((c) => c[1] === PATH)!;
        expect(call[4]).toEqual({ at: 1, label: "Speed" });
        expect(count(content)).toBe("Section 2 / 3");
    });

    it("keeps the place for the Library, and never writes the note (AC-5)", async () => {
        const { content, host, vault, fileManager, contents } = await open();
        press(content as never, "ArrowRight");
        await settle(() => count(content) === "Section 2 / 3");
        press(content as never, "ArrowRight");
        await settle(() => count(content) === "Section 3 / 3");
        expect((host.settings.library as any)[PATH]).toMatchObject({ chapter: 2, chapters: 3, done: true, title: "The case for slow software" });
        for (const write of [vault.modify, vault.process, vault.create, vault.append, fileManager.processFrontMatter, fileManager.renameFile]) expect(write).not.toHaveBeenCalled();
        expect(contents.get(PATH)).toBe(NOTE);
    });

    it("lands on the section it was left on (AC-4)", async () => {
        const { content } = await open(2, { library: { [PATH]: { size: NOTE.length, mtime: 20, chapters: 3, chapter: 2, at: 5 } } });
        expect(count(content)).toBe("Section 3 / 3");
    });
});

describe("an article as a source (#744)", () => {
    it("keeps a footnote in its section, and never follows a link out of the article", async () => {
        const { app } = mount();
        const doc = await openSourceDocument(app as never, PATH);
        expect(doc.format).toBe("article");
        expect(doc.hasPageView).toBe(false);
        expect(doc.chapters.map((chapter) => chapter.label)).toEqual(["The case for slow software", "Speed", "Care"]);
        expect(doc.toc).toEqual([
            { title: "The case for slow software", chapter: 0, depth: 0 },
            { title: "Speed", chapter: 1, depth: 0 },
            { title: "Measured", chapter: 1, depth: 1, fragment: "zf-heading-1" },
            { title: "Care", chapter: 2, depth: 0 },
        ]);
        expect(doc.resolveLink?.(1, "#fn-1-3f2a")).toEqual({ chapter: 1, fragment: "fn-1-3f2a" });
        expect(doc.resolveLink?.(1, "https://example.com")).toBeNull();
        expect(doc.resolveLink?.(1, "Notes/Other")).toBeNull();
        await expect(openSourceDocument(app as never, "Clippings/missing.md")).rejects.toThrow("not a source");
    });
});
