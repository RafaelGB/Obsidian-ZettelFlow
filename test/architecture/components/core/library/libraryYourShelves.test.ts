/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest } from "@jest/globals";
import { Menu, TFile, WorkspaceLeaf } from "obsidian";
import { DomNode, flush } from "../../../../support/dashboardDom";
import { LibraryView } from "architecture/components/core/library/LibraryView";

/** Your shelves (#821): make one, put books on it by hand or by menu, rename it, delete it, undo. */

const DAY = 86_400_000;
const BOOK = "Books/Thinking.epub";
const PAPER = "Papers/cap.pdf";
const FRESH = "Books/Fresh.epub";

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
    [BOOK]: { size: 10, mtime: 20, title: "Thinking", author: "Daniel Kahneman", chapters: 38, chapter: 2, at: Date.now() - DAY },
    [PAPER]: { size: 10, mtime: 20, title: "Brewer's conjecture", chapters: 12, chapter: 3, at: Date.now() - 2 * DAY },
    [FRESH]: { size: 10, mtime: 20, title: "Fresh", chapters: 9 },
};

function mount(notes: Record<string, Record<string, unknown>> = {}, settings: Record<string, unknown> = {}, extra: string[] = []) {
    const sources = [BOOK, PAPER, FRESH, ...extra].map(file);
    const markdown = Object.keys(notes).map(file);
    const on = () => ({});
    const app = {
        workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), getActiveFile: () => null, getLastOpenFiles: () => [], on },
        vault: {
            getFiles: () => [...sources, ...markdown],
            getMarkdownFiles: () => markdown,
            getAbstractFileByPath: (path: string) => sources.find((f) => f.path === path) ?? markdown.find((f) => f.path === path) ?? null,
            on,
        },
        metadataCache: {
            getFileCache: (f: TFile) => (notes[f.path] ? { frontmatter: notes[f.path] } : null),
            getFirstLinkpathDest: (link: string) => sources.find((s) => s.path === link) ?? null,
            on,
        },
    };
    const port = {
        create: jest.fn(async (request: any) => ({ file: file(`Library/${request.title}.md`), batch: "b1", fields: { book: `[[${request.source}]]`, ...request.change } })),
        edit: jest.fn(async (f: TFile) => ({ file: f, batch: "b2" })),
        editArticle: jest.fn(async (f: TFile) => ({ file: f, batch: "b3" })),
        undo: jest.fn(async () => ({ restored: 1, skipped: 0 })),
        noteAt: (path: string) => file(path),
    };
    const content = new DomNode();
    const host = { settings: { library, ...settings }, saveSettings: jest.fn(async () => undefined) };
    const view = new LibraryView(new WorkspaceLeaf(app, content), host, { shelves: { port: port as never }, details: { suggest: () => undefined } });
    return { view, content, host, port };
}

const stands = (content: DomNode) => content.byClass("shelf-bay").map((bay) => [bay.attrs["data-zf-shelf"], bay.byClass("shelf-book").map((el) => el.attrs["data-shelf-id"])]);
const bay = (content: DomNode, shelf: string) => content.byClass("shelf-bay").find((el) => el.attrs["data-zf-shelf"] === shelf)!;
const book = (content: DomNode, id: string) => content.byClass("shelf-book").find((el) => el.attrs["data-shelf-id"] === id)!;
const transfer = () => ({ dropEffect: "none", effectAllowed: "all", setData: jest.fn(), getData: jest.fn(), setDragImage: jest.fn() });

describe("+ New shelf (#821 AC-20, AC-12)", () => {
    it("names a shelf where it will stand, and it stands empty, saying what it is for — nothing written to the vault", async () => {
        const { view, content, host, port } = mount();
        await view.onOpen();
        content.oneByClass("shelf-filter--new").click();
        const input = content.oneByClass("shelf-name-input");
        input.value = "Leyendo";
        input.fire("keydown", { key: "Enter" });
        expect(content.oneByClass("shelf-name-why").textContent).toBe("Leyendo is one of the Library's own shelves");
        expect(host.saveSettings).not.toHaveBeenCalled();
        input.value = "Para releer";
        input.fire("keydown", { key: "Enter" });
        expect(host.settings).toMatchObject({ libraryShelves: ["Para releer"] });
        expect(host.saveSettings).toHaveBeenCalledTimes(1);
        const own = bay(content, "own:Para releer");
        expect(own.oneByClass("shelf-drop-hint").textContent).toBe("Drag books here to shelve them");
        expect(own.byClass("shelf-own-mark")).toHaveLength(1);
        expect(content.byClass("shelf-filter--own").map((el) => el.textContent)).toEqual(["Para releer"]);
        for (const spy of [port.create, port.edit, port.editArticle]) expect(spy).not.toHaveBeenCalled();
    });

    it("lets it go with Esc, keeping nothing", async () => {
        const { view, content, host } = mount();
        await view.onOpen();
        content.oneByClass("shelf-filter--new").click();
        const input = content.oneByClass("shelf-name-input");
        input.value = "Para releer";
        input.fire("keydown", { key: "Escape" });
        expect(content.byClass("shelf-name-input")).toHaveLength(0);
        expect(host.saveSettings).not.toHaveBeenCalled();
    });
});

describe("Move to shelf… (#821 AC-18, AC-19, FR-16)", () => {
    it("lists where a book can go, the shelf it stands on checked — and On the shelf only for a book never opened", async () => {
        const { view, content } = mount({}, { libraryShelves: ["Para releer"] });
        await view.onOpen();
        book(content, FRESH).oneByClass("shelf-more").click();
        expect(Menu.last!.items.map((item) => item.title)).toEqual(["Details", "Move to shelf…"]);
        Menu.last!.item("Move to shelf…").click();
        expect(Menu.last!.items.map((item) => [item.title, item.checked])).toEqual([
            ["Reading", false],
            ["Want to read", false],
            ["On the shelf", true],
            ["Finished", false],
            ["Para releer", false],
        ]);
        // A book you opened never goes back to On the shelf.
        content.oneByClass("shelf-desk-more").click();
        Menu.last!.item("Move to shelf…").click();
        expect(Menu.last!.items.map((item) => item.title)).not.toContain("On the shelf");
    });

    it("puts it there in one recorded write, carries it over, and takes it back with Undo", async () => {
        const { view, content, port, host } = mount({}, { libraryShelves: ["Para releer"] });
        await view.onOpen();
        book(content, FRESH).oneByClass("shelf-more").click();
        Menu.last!.item("Move to shelf…").click();
        Menu.last!.item("Para releer").click();
        await flush();
        expect(port.create).toHaveBeenCalledTimes(1);
        expect((port.create.mock.calls[0] as any[])[0]).toMatchObject({ source: FRESH, change: { collections: ["Para releer"] } });
        expect(stands(content)).toContainEqual(["own:Para releer", [FRESH]]);
        const line = content.oneByClass("shelf-message");
        expect(line.attrs.role).toBe("status");
        expect(line.textContent).toBe("Moved to Para releerUndo");
        content.oneByClass("shelf-message-undo").click();
        await flush();
        expect(port.undo).toHaveBeenCalledTimes(1);
        expect(host.settings).toMatchObject({ libraryShelves: ["Para releer"] });
    });

    it("takes a book off every shelf of yours onto a status shelf (decision 1)", async () => {
        const { view, content, port } = mount({ "Library/Fresh.md": { book: `[[${FRESH}]]`, collections: ["A", "B"] } });
        await view.onOpen();
        expect(stands(content)).toContainEqual(["own:A", [FRESH]]);
        book(content, FRESH).oneByClass("shelf-more").click();
        Menu.last!.item("Move to shelf…").click();
        Menu.last!.item("Want to read").click();
        await flush();
        expect((port.edit.mock.calls[0] as any[])[1]).toEqual({ collections: null, status: "to-read" });
        expect(stands(content)).toContainEqual(["to-read", [FRESH]]);
    });

    it("says so on the line when the write fails, and moves nothing", async () => {
        const { view, content, port } = mount({}, { libraryShelves: ["Para releer"] });
        port.create.mockImplementationOnce(async () => {
            throw new Error("disk");
        });
        await view.onOpen();
        book(content, FRESH).oneByClass("shelf-more").click();
        Menu.last!.item("Move to shelf…").click();
        Menu.last!.item("Para releer").click();
        await flush();
        expect(content.oneByClass("shelf-message").textContent).toBe("Could not change the shelf. Nothing was written.");
        expect(stands(content)).toContainEqual(["own:Para releer", []]);
    });
});

describe("dragging a book to a shelf (#821 AC-17)", () => {
    it("lights the one shelf that takes it, and a drop puts it there", async () => {
        const { view, content, port } = mount({}, { libraryShelves: ["Para releer"] });
        await view.onOpen();
        const fresh = book(content, FRESH);
        expect(fresh.attrs.draggable).toBe("true");
        const dataTransfer = transfer();
        fresh.fire("dragstart", { dataTransfer });
        expect(fresh.hasClass("zettelkasten-flow__shelf-book--lifted")).toBe(true);
        expect(dataTransfer.setDragImage).toHaveBeenCalled();
        const target = bay(content, "own:Para releer");
        const over = target.fire("dragover", { dataTransfer });
        expect(over.defaultPrevented).toBe(true);
        expect(content.byClass("shelf-bay--drop")).toEqual([target]);
        target.fire("drop", { dataTransfer });
        await flush();
        expect(port.create).toHaveBeenCalledTimes(1);
        expect(stands(content)).toContainEqual(["own:Para releer", [FRESH]]);
    });

    it("never lights On the shelf for a book you opened, and a drop there writes nothing", async () => {
        const OTHER = "Books/Other.epub";
        // Three opened: the desk holds two; the third stands on Reading.
        const { view, content, port } = mount({}, { library: { ...library, [OTHER]: { size: 10, mtime: 20, title: "Other", chapters: 5, chapter: 1, at: Date.now() - 3 * DAY } } }, [OTHER]);
        await view.onOpen();
        expect(stands(content)).toEqual([
            ["reading", [OTHER]],
            ["none", [FRESH]],
        ]);
        const opened = book(content, OTHER);
        const dataTransfer = transfer();
        opened.fire("dragstart", { dataTransfer });
        const over = bay(content, "none").fire("dragover", { dataTransfer });
        expect(over.defaultPrevented).toBe(false);
        expect(content.byClass("shelf-bay--drop")).toHaveLength(0);
        bay(content, "none").fire("drop", { dataTransfer });
        opened.fire("dragend");
        // Esc, or a drop outside: the drag ends, and nothing is written.
        book(content, FRESH).fire("dragstart", { dataTransfer });
        book(content, FRESH).fire("dragend");
        await flush();
        expect(port.create).not.toHaveBeenCalled();
        expect(port.edit).not.toHaveBeenCalled();
    });

    it("offers no drop where one status or one shelf is chosen", async () => {
        const { view, content } = mount({}, { libraryShelves: ["Para releer"] });
        await view.onOpen();
        content.byClass("shelf-filter--own")[0].click();
        expect(content.byClass("shelf-book").every((el) => el.attrs.draggable === undefined)).toBe(true);
    });
});

describe("renaming and deleting a shelf of yours (#821 AC-21, AC-10, AC-11)", () => {
    const notes = {
        "Library/Thinking.md": { book: `[[${BOOK}]]`, status: "finished", collections: ["Ensayos", "Otros"] },
        "Library/Fresh.md": { book: `[[${FRESH}]]`, collections: ["Otros", "Ensayos"] },
    };

    it("has a menu on your shelf's label only: rename it in place, in one write across its notes", async () => {
        const { view, content, port, host } = mount(notes, { libraryShelves: ["Ensayos"] }, ["Books/Loose.epub"]);
        await view.onOpen();
        const statusBays = content.byClass("shelf-bay").filter((el) => !el.attrs["data-zf-shelf"].startsWith("own:"));
        expect(statusBays.map((el) => el.attrs["data-zf-shelf"])).toEqual(["none"]);
        expect(statusBays.every((el) => el.byClass("shelf-label-more").length === 0)).toBe(true);
        bay(content, "own:Ensayos").oneByClass("shelf-label-more").click();
        expect(Menu.last!.items.map((item) => [item.title, item.disabled])).toEqual([
            ["Rename shelf", false],
            ["Delete shelf", false],
            ["Its books stay, on their next shelf", true],
        ]);
        Menu.last!.item("Rename shelf").click();
        const input = content.oneByClass("shelf-name-input");
        expect(input.value).toBe("Ensayos");
        input.value = "Ensayos breves";
        input.fire("keydown", { key: "Enter" });
        await flush();
        expect(port.edit.mock.calls.map((call: any[]) => [call[0].path, call[1]])).toEqual([
            ["Library/Thinking.md", { collections: ["Ensayos breves", "Otros"] }],
            ["Library/Fresh.md", { collections: ["Otros", "Ensayos breves"] }],
        ]);
        expect(host.settings).toMatchObject({ libraryShelves: ["Ensayos breves"] });
        expect(content.byClass("shelf-filter--own").map((el) => el.textContent)).toEqual(["Ensayos breves", "Otros"]);
    });

    it("deletes it: its books stay, on their next shelf — and Undo brings it back", async () => {
        const { view, content, port, host } = mount(notes, { libraryShelves: ["Ensayos"] });
        await view.onOpen();
        bay(content, "own:Ensayos").oneByClass("shelf-label-more").click();
        Menu.last!.item("Delete shelf").click();
        await flush();
        expect(port.edit.mock.calls.map((call: any[]) => call[1])).toEqual([{ collections: ["Otros"] }, { collections: ["Otros"] }]);
        expect(host.settings).toMatchObject({ libraryShelves: [] });
        expect(stands(content).map(([shelf]) => shelf)).not.toContain("own:Ensayos");
        expect(stands(content)).toContainEqual(["own:Otros", expect.arrayContaining([BOOK, FRESH])]);
        content.oneByClass("shelf-message-undo").click();
        await flush();
        expect(port.undo).toHaveBeenCalledWith(expect.any(String));
        expect(host.settings).toMatchObject({ libraryShelves: ["Ensayos"] });
    });
});

describe("a saved reading path (#821 AC-19)", () => {
    it("is never dragged, and its menu has no Move to shelf…", async () => {
        const { view, content } = mount({}, { readerSaved: [{ id: "r1", name: "A path", kind: "selection", seed: "n/a.md", paths: ["n/a.md"], at: 0 }] });
        await view.onOpen();
        const path = book(content, "path:r1");
        expect(path.attrs.draggable).toBeUndefined();
        path.oneByClass("shelf-more").click();
        expect(Menu.last!.items.map((item) => item.title)).toEqual(["Details"]);
    });
});
