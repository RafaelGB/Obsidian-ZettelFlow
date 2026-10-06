import { describe, it, expect, jest } from "@jest/globals";
import { TFile, WorkspaceLeaf } from "obsidian";
import { DomNode, flush } from "../../../../support/dashboardDom";
import { press } from "../../../../support/readerKeys";
import { LibraryView, whereLabel } from "architecture/components/core/library/LibraryView";
import { groupHighlights } from "architecture/components/core/library/libraryDetail";
import type { Thought } from "application/thinking/thought";

const DAY = 86_400_000;

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.name = path.split("/").pop() ?? path;
    f.extension = path.split(".").pop() ?? "";
    (f as unknown as { stat: unknown }).stat = { size: 10, mtime: 20, ctime: 1 };
    return f;
}

function mount(paths: string[], settings: Record<string, unknown> = {}, active: string | null = null) {
    const files = paths.map(file);
    const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    const on = (name: string, fn: (...args: unknown[]) => void) => {
        (handlers[name] ??= []).push(fn);
        return { name };
    };
    const app = {
        workspace: {
            requestSaveLayout: jest.fn(),
            openLinkText: jest.fn(),
            getActiveFile: () => (active ? file(active) : null),
            getLastOpenFiles: () => [],
            on,
        },
        vault: {
            getFiles: () => files,
            getAbstractFileByPath: (path: string) => files.find((f) => f.path === path) ?? null,
            on,
        },
        metadataCache: { on },
    };
    const content = new DomNode();
    const leaf = new WorkspaceLeaf(app, content);
    const host = { settings: { ...settings }, saveSettings: jest.fn(async () => undefined) };
    const view = new LibraryView(leaf, host);
    return { view, app, content, host, handlers };
}

const titles = (content: DomNode, cls = "shelf-card-title") => content.byClass(cls).map((el) => el.textContent);

const library = {
    "Books/Thinking, Fast and Slow.epub": { size: 10, mtime: 20, title: "Thinking, Fast and Slow", author: "Daniel Kahneman", chapters: 38, chapter: 2, at: Date.now() - DAY },
    "Papers/cap.pdf": { size: 10, mtime: 20, title: "Brewer's conjecture", chapters: 12, chapter: 5, at: Date.now() },
    "Papers/scan.pdf": { size: 10, mtime: 20, chapters: 4, imageOnly: true },
};

describe("the Library (#680)", () => {
    it("says what it is for when the vault has nothing to read, and offers a path across your notes", async () => {
        const { view, content } = mount(["notes/a.md"], {}, "notes/a.md");
        await view.onOpen();
        expect(content.oneByClass("shelf-empty-title").textContent).toBe("Your shelf is empty, for now");
        expect(content.byText("Read a path across your notes")).toBeDefined();
        expect(content.byClass("shelf-search")).toHaveLength(0);
    });

    it("puts the vault's PDFs and EPUBs and your saved paths on one shelf, with what came of each", async () => {
        const { view, content } = mount(["Books/Thinking, Fast and Slow.epub", "Papers/cap.pdf", "Papers/scan.pdf", "notes/a.md"], {
            library,
            readerSaved: [{ id: "r1", name: "Distributed systems · Argument", kind: "selection", seed: "n/a.md", paths: ["n/a.md", "n/b.md"], at: 5 }],
        });
        await view.onOpen();
        expect(titles(content)).toEqual(["Brewer's conjecture", "Thinking, Fast and Slow", "Distributed systems · Argument", "scan"]);
        expect(content.byClass("shelf-kind").map((el) => el.textContent)).toEqual(["PDF", "EPUB", "Path", "PDF"]);
        // Continue reading: the two you were last in, the paper first.
        expect(titles(content, "shelf-hero-title")).toEqual(["Brewer's conjecture", "Thinking, Fast and Slow"]);
        expect(content.byClass("shelf-hero-where").map((el) => el.textContent)).toEqual(["Page 6 of 12", "Chapter 3 of 38"]);
        // A scan says so on its card, before you open it.
        expect(content.byClass("shelf-scanned").map((el) => el.textContent)).toEqual(["Scanned · read only"]);
        expect(content.byClass("shelf-card-author").map((el) => el.textContent)).toContain("A reading of 2 notes");
    });

    it("filters with counts, searches titles and authors, and sorts", async () => {
        const { view, content } = mount(["Books/Thinking, Fast and Slow.epub", "Papers/cap.pdf", "Papers/scan.pdf"], { library });
        await view.onOpen();
        const chips = content.byClass("shelf-filter");
        expect(chips.map((el) => el.textContent)).toEqual(["All3", "Books1", "Papers2", "Paths0"]);
        chips[2].click();
        expect(content.byClass("shelf-hero")).toHaveLength(0);
        expect(content.oneByClass("shelf-section").textContent).toBe("Papers");
        const input = content.oneByClass("shelf-search-input");
        input.value = "kahneman";
        input.fire("input");
        expect(content.oneByClass("shelf-no-match").textContent).toBe("Nothing matches “kahneman”.");
        content.byClass("shelf-filter")[0].click();
        expect(titles(content)).toEqual(["Thinking, Fast and Slow"]);
        input.value = "";
        content.oneByClass("shelf-search-input").value = "";
        content.oneByClass("shelf-search-input").fire("input");
        const sort = content.oneByClass("shelf-sort");
        sort.value = "title";
        sort.fire("change");
        expect(titles(content)).toEqual(["Brewer's conjecture", "scan", "Thinking, Fast and Slow"]);
        expect(view.getState()).toMatchObject({ filter: "all", sort: "title" });
    });

    it("opens a source's detail from ⋯ and closes it with Esc, leaving Esc alone otherwise", async () => {
        const { view, content } = mount(["Papers/cap.pdf"], { library });
        await view.onOpen();
        content.oneByClass("shelf-more").click();
        await flush();
        expect(content.oneByClass("shelf-detail").hasClass("zettelkasten-flow__shelf-detail--open")).toBe(true);
        expect(content.oneByClass("shelf-detail-title").textContent).toBe("Brewer's conjecture");
        expect(content.oneByClass("shelf-detail-file").textContent).toBe("Papers/cap.pdf");
        expect(content.byClass("shelf-detail-stat-label").map((el) => el.textContent)).toEqual(["read · 3 days ago", "highlights", "notes born"]);
        expect(content.oneByClass("shelf-detail-empty").textContent).toBe("No highlights yet. Open it and select a passage.");
        expect(press(content as never, "Escape").defaultPrevented).toBe(true);
        expect(content.oneByClass("shelf-detail").hasClass("zettelkasten-flow__shelf-detail--open")).toBe(false);
        expect(press(content as never, "Escape").defaultPrevented).toBe(false);
    });

    it("opens what the file menu asked for in detail, and remembers where it is", async () => {
        const { view, content } = mount(["Papers/cap.pdf"], { library });
        await view.setState({ detail: "Papers/cap.pdf", filter: "papers" }, {} as never);
        await view.onOpen();
        expect(content.oneByClass("shelf-detail-title").textContent).toBe("Brewer's conjecture");
        expect(view.getState()).toMatchObject({ detail: "Papers/cap.pdf", filter: "papers" });
    });

    it("keeps what it knows about a source through a rename", async () => {
        const { view, host, handlers } = mount(["Papers/cap.pdf"], { library: { "Papers/cap.pdf": library["Papers/cap.pdf"] } });
        await view.onOpen();
        handlers.rename[0](file("Archive/cap.pdf"), "Papers/cap.pdf");
        expect(Object.keys(host.settings.library as object)).toEqual(["Archive/cap.pdf"]);
    });

    it("says where you are the way a reader says it", () => {
        const base = { id: "x", title: "x", progress: 0, highlights: 0, born: 0, lastRead: 0, place: 3, chapters: 10 };
        expect(whereLabel({ ...base, kind: "paper", format: "pdf" })).toBe("Page 4 of 10");
        expect(whereLabel({ ...base, kind: "path", format: "path" })).toBe("Note 4 of 10");
        expect(whereLabel({ ...base, kind: "book", format: "epub", place: undefined })).toBe("");
    });

    it("groups a path's highlights by its notes, in reading order", () => {
        const thought = (id: string, about: string, heading?: string): Thought => ({
            id,
            at: 1,
            text: "",
            links: [],
            about,
            quote: { exact: id, prefix: "", suffix: "", ...(heading ? { heading } : {}) },
        });
        const path = { id: "path:r", kind: "path" as const, format: "path" as const, title: "p", progress: 0, highlights: 2, born: 0, lastRead: 0, paths: ["b.md", "a.md"] };
        expect(groupHighlights(path, [thought("1", "a.md"), thought("2", "b.md")]).map((g) => [g.label, g.chapter, g.items.map((i) => i.id)])).toEqual([
            ["b", 0, ["2"]],
            ["a", 1, ["1"]],
        ]);
        const book = { ...path, id: "b.epub", kind: "book" as const, format: "epub" as const, paths: undefined, file: "b.epub" };
        expect(groupHighlights(book, [thought("1", "b.epub", "Ch. 1"), thought("2", "b.epub", "Ch. 2"), thought("3", "b.epub", "Ch. 1")]).map((g) => g.label)).toEqual(["Ch. 1", "Ch. 2"]);
    });
});
