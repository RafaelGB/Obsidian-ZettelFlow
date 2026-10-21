/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest } from "@jest/globals";
import { Menu, TFile, WorkspaceLeaf } from "obsidian";
import { DomNode, flush } from "../../../../support/dashboardDom";
import { LibraryView } from "architecture/components/core/library/LibraryView";
import type { ArchivePort } from "architecture/plugin/library/archiveWrites";

const openReader = jest.fn();
jest.mock("architecture/components/core/reader/openReader", () => ({ openReader: (...args: unknown[]) => openReader(...args) }));

/** The archive in the Library (#865): the cabinet, its drawers, its doors and its lines. */

const BOOK = "Books/Quiet Index.epub";
const PAPER = "Books/Tech/Rivers.pdf";
const OLD = "Library archive/Old Manual.epub";
const LANTERNS = "Library archive/Lanterns.md";

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.name = path.split("/").pop() ?? path;
    f.basename = f.name.replace(/\.[^.]+$/, "");
    f.extension = path.split(".").pop() ?? "";
    (f as unknown as { stat: unknown }).stat = { size: 10, mtime: 20, ctime: 1 };
    return f;
}

const library = {
    [BOOK]: { size: 10, mtime: 20, title: "The Quiet Index", author: "Ana Ríos", chapters: 30 },
    [PAPER]: { size: 10, mtime: 20, title: "Field Notes on Rivers", chapters: 12 },
    [OLD]: { size: 10, mtime: 20, title: "Old Manual", author: "Someone", chapters: 300 },
};

function mount(settings: Record<string, unknown> = {}, extraSources: string[] = [OLD]) {
    const paths = new Set([BOOK, PAPER, ...extraSources, LANTERNS]);
    const fm: Record<string, Record<string, unknown>> = { [LANTERNS]: { source: "https://example.org/lanterns", title: "A Report on Lanterns" } };
    const on = () => ({});
    const files = () => [...paths].map(file);
    const app = {
        workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), getActiveFile: () => null, getLastOpenFiles: () => [], on },
        vault: {
            getFiles: files,
            getMarkdownFiles: () => files().filter((f) => f.extension === "md"),
            getAbstractFileByPath: (path: string) => (paths.has(path) ? file(path) : null),
            on,
        },
        metadataCache: {
            getFileCache: (f: TFile) => (fm[f.path] ? { frontmatter: fm[f.path] } : null),
            getFirstLinkpathDest: () => null,
            on,
        },
    };
    const moves: [string, string][] = [];
    const port: ArchivePort = {
        file: (path) => (paths.has(path) ? file(path) : null),
        folderExists: (path) => [...paths].some((p) => p.startsWith(`${path}/`)),
        exists: (path) => paths.has(path),
        createFolder: async () => undefined,
        move: async (f, to) => {
            paths.delete(f.path);
            paths.add(to);
            moves.push([f.path, to]);
        },
        relink: async () => undefined,
    };
    const undo = jest.fn(async () => undefined);
    const content = new DomNode();
    const host = {
        settings: { library, libraryArchive: { [OLD]: { from: "Books/Old Manual.epub", at: new Date(2026, 8, 12).getTime() } }, ...settings } as Record<string, any>,
        saveSettings: jest.fn(async () => undefined),
    };
    const view = new LibraryView(new WorkspaceLeaf(app, content), host as never, { details: { suggest: () => undefined }, archive: { port, undo } });
    return { view, content, host, moves, undo, paths };
}

const ids = (content: DomNode) => content.byClass("shelf-book").map((el) => el.attrs["data-shelf-id"]);
const book = (content: DomNode, id: string) => content.byClass("shelf-book").find((el) => el.attrs["data-shelf-id"] === id)!;
const drawers = (content: DomNode) => content.byClass("shelf-drawer").map((el) => el.textContent);
const chip = (content: DomNode, name: string) => content.byClass("shelf-filter--kind").find((el) => el.textContent.startsWith(name))!;

describe("the cabinet at the end of the stacks (#865 FR-13, FR-15, AC-2, AC-13)", () => {
    it("holds what lies in the archive, and the shelves and chips do not", async () => {
        const { view, content } = mount();
        await view.onOpen();
        expect(ids(content)).not.toContain(OLD);
        expect(ids(content)).not.toContain(LANTERNS);
        expect(chip(content, "All").textContent).toBe("All2");
        expect(drawers(content)).toEqual(["Books1 item", "Papersempty", "Articles1 item"]);
        expect(content.oneByClass("shelf-archive-count").textContent).toBe("2 things put away.");
        expect(content.oneByClass("shelf-archive-folder").textContent).toBe("In Library archive/");
    });

    it("says nothing is put away yet, and is gone while the archive is off (AC-10)", async () => {
        const empty = mount({ libraryArchive: {} }, []);
        await empty.view.onOpen();
        expect(empty.content.oneByClass("shelf-archive-count").textContent).toBe("1 thing put away.");
        const off = mount({ libraryArchiveFolder: "" });
        await off.view.onOpen();
        expect(off.content.byClass("shelf-cabinet")).toHaveLength(0);
        // Off, the archive folder is an ordinary folder: what is in it stands on the shelves again.
        expect(ids(off.content)).toContain(OLD);
        book(off.content, BOOK).oneByClass("shelf-more").click();
        expect(Menu.last!.items.map((item) => item.title)).not.toContain("Archive");
    });
});

describe("a drawer, pulled out (#865 FR-19, FR-20, FR-21, AC-13, AC-14)", () => {
    it("unfolds below the cabinet into index cards, with its own search", async () => {
        const { view, content } = mount();
        await view.onOpen();
        content.byClass("shelf-drawer")[0].click();
        const cards = content.byClass("shelf-archive-card");
        expect(cards).toHaveLength(1);
        expect(cards[0].oneByClass("shelf-archive-card-title").textContent).toBe("Old Manual");
        expect(cards[0].oneByClass("shelf-archive-card-tab").textContent).toBe("EPUB");
        expect(cards[0].oneByClass("shelf-archive-card-meta").textContent).toContain("was in Books/");
        const search = content.oneByClass("shelf-archive-search");
        search.value = "zzz";
        search.fire("input");
        expect(content.oneByClass("shelf-archive-empty").textContent).toBe("No card matches.");
        content.byClass("shelf-drawer")[1].click();
        expect(content.oneByClass("shelf-archive-empty").textContent).toBe("The papers drawer is empty.");
        content.oneByClass("shelf-archive-close").click();
        expect(content.byClass("shelf-archive-tray")).toHaveLength(0);
    });

    it("says an article's origin is unknown when nothing remembers it, and Open leaves it archived", async () => {
        const { view, content, moves } = mount();
        await view.onOpen();
        content.byClass("shelf-drawer")[2].click();
        const card = content.oneByClass("shelf-archive-card");
        expect(card.oneByClass("shelf-archive-card-meta").textContent).toBe("where it came from is not known");
        card.byClass("shelf-archive-card-action")[1].click();
        await flush();
        expect(openReader).toHaveBeenCalled();
        expect(moves).toEqual([]);
    });

    it("returns a book where it came from, says where, and offers Undo", async () => {
        const { view, content, moves, host, undo } = mount();
        await view.onOpen();
        content.byClass("shelf-drawer")[0].click();
        content.oneByClass("shelf-archive-card").byClass("shelf-archive-card-action")[0].click();
        await flush();
        expect(moves).toEqual([[OLD, "Books/Old Manual.epub"]]);
        expect(host.settings.libraryArchive).toEqual({});
        expect(ids(content)).toContain("Books/Old Manual.epub");
        const line = content.oneByClass("shelf-archive-tray").oneByClass("shelf-archive-line");
        expect(line.textContent).toContain("Back in Books/.");
        line.oneByClass("shelf-message-undo").click();
        await flush();
        expect(undo).toHaveBeenCalledTimes(1);
    });

    it("offers no Return for an article while articles are off, and says why (AC-6)", async () => {
        const { view, content } = mount({ articlesFolder: "" });
        await view.onOpen();
        content.byClass("shelf-drawer")[2].click();
        const card = content.oneByClass("shelf-archive-card");
        expect(card.byClass("shelf-archive-card-action").map((el) => el.textContent)).toEqual(["Open"]);
        expect(card.oneByClass("shelf-archive-card-why").textContent).toBe("Articles are off, so it has no shelf to go back to.");
    });
});

describe("the doors to the archive (#865 FR-16, FR-18, AC-8, AC-12)", () => {
    it("the book's menu archives it: off the shelf, into its drawer, with Undo beside the cabinet", async () => {
        const { view, content, moves, host, undo } = mount();
        await view.onOpen();
        book(content, PAPER).oneByClass("shelf-more").click();
        Menu.last!.item("Archive").click();
        await flush();
        expect(moves).toEqual([[PAPER, "Library archive/Rivers.pdf"]]);
        expect(host.settings.libraryArchive["Library archive/Rivers.pdf"].from).toBe(PAPER);
        expect(ids(content)).not.toContain(PAPER);
        expect(drawers(content)[1]).toBe("Papers1 item");
        const line = content.oneByClass("shelf-archive-side").oneByClass("shelf-archive-line");
        expect(line.textContent).toContain("Archived “Field Notes on Rivers”.");
        line.oneByClass("shelf-message-undo").click();
        await flush();
        expect(undo).toHaveBeenCalledTimes(1);
    });

    it("the detail archives it too", async () => {
        const { view, content, moves } = mount();
        await view.onOpen();
        book(content, BOOK).oneByClass("shelf-more").click();
        Menu.last!.item("Details").click();
        const button = (view as any).aside.findAll((el: DomNode) => el.attrs["data-zf-archive"] !== undefined)[0] as DomNode;
        button.click();
        await flush();
        expect(moves).toEqual([[BOOK, "Library archive/Quiet Index.epub"]]);
    });

    it("a drop on the cabinet archives it; a saved path is never taken", async () => {
        const { view, content, moves } = mount({ readerSaved: [{ id: "p1", name: "A path", kind: "selection", seed: "N.md", paths: ["N.md"], at: 1 }] });
        await view.onOpen();
        const cabinet = content.oneByClass("shelf-cabinet");
        const dataTransfer = { dropEffect: "none", effectAllowed: "all", setData: jest.fn(), getData: jest.fn(), setDragImage: jest.fn() };
        const path = content.byClass("shelf-book").find((el) => el.attrs["data-shelf-id"] === "path:p1");
        expect(path?.attrs.draggable).toBeUndefined();
        book(content, PAPER).fire("dragstart", { dataTransfer });
        // Carried: the cabinet says it will take it, and its cue line shows.
        expect(content.oneByClass("shelf").hasClass("zettelkasten-flow__shelf--carrying")).toBe(true);
        expect(cabinet.fire("dragover", { dataTransfer }).defaultPrevented).toBe(true);
        cabinet.fire("drop", { dataTransfer });
        await flush();
        expect(moves).toEqual([[PAPER, "Library archive/Rivers.pdf"]]);
        expect(content.oneByClass("shelf").hasClass("zettelkasten-flow__shelf--carrying")).toBe(false);
    });
});

describe("a search that finds something put away (#865 FR-14, AC-3)", () => {
    it("says how many more are in the archive, and opens the drawer holding the query", async () => {
        const { view, content } = mount();
        await view.onOpen();
        const input = content.oneByClass("shelf-search-input");
        input.value = "manual";
        input.fire("input");
        expect(ids(content)).toEqual([]);
        const more = content.oneByClass("shelf-archive-more");
        expect(more.textContent).toBe("1 more in the archiveLook in the archive");
        more.oneByClass("shelf-archive-look").click();
        expect(content.oneByClass("shelf-archive-search").value).toBe("manual");
        expect(content.byClass("shelf-archive-card")).toHaveLength(1);
        input.value = "";
        content.oneByClass("shelf-search-input").value = "";
        content.oneByClass("shelf-search-input").fire("input");
        expect(content.byClass("shelf-archive-more")).toHaveLength(0);
    });
});

describe("Undo says what it did (#865 review)", () => {
    it("says there was nothing to undo when the batch could not be taken back", async () => {
        const { view, content, undo } = mount();
        undo.mockImplementation(async () => ({ hadWork: false, done: 0, failed: [] }) as never);
        await view.onOpen();
        book(content, PAPER).oneByClass("shelf-more").click();
        Menu.last!.item("Archive").click();
        await flush();
        content.oneByClass("shelf-archive-side").oneByClass("shelf-message-undo").click();
        await flush();
        const line = content.oneByClass("shelf-archive-side").oneByClass("shelf-archive-line");
        expect(line.hasClass("zettelkasten-flow__shelf-archive-line--failed")).toBe(true);
    });
});
