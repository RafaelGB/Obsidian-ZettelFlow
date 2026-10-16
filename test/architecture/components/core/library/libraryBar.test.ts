import { describe, it, expect, jest } from "@jest/globals";
import { TFile, WorkspaceLeaf } from "obsidian";
import { DomNode } from "../../../../support/dashboardDom";
import { press } from "../../../../support/readerKeys";
import { LibraryView } from "architecture/components/core/library/LibraryView";

/** The bar that stays (#819): one bar, one row of chips, `/` to search, covers or spines. */

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.name = path.split("/").pop() ?? path;
    f.extension = path.split(".").pop() ?? "";
    (f as unknown as { stat: unknown }).stat = { size: 10, mtime: 20, ctime: 1 };
    return f;
}

function mount(paths: string[], settings: Record<string, unknown> = {}) {
    const files = paths.map(file);
    const on = () => ({});
    const app = {
        workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), getActiveFile: () => null, getLastOpenFiles: () => [], on },
        vault: { getFiles: () => files, getAbstractFileByPath: (path: string) => files.find((f) => f.path === path) ?? null, on },
        metadataCache: { on },
    };
    const content = new DomNode();
    const leaf = new WorkspaceLeaf(app, content);
    const host = { settings: { ...settings }, saveSettings: jest.fn(async () => undefined) };
    const view = new LibraryView(leaf, host);
    return { view, content, host };
}

const library = {
    "Books/Thinking.epub": { size: 10, mtime: 20, title: "Thinking, Fast and Slow", author: "Daniel Kahneman", chapters: 38, chapter: 2, at: Date.now() },
    "Papers/cap.pdf": { size: 10, mtime: 20, title: "Brewer's conjecture", chapters: 12 },
};
const PATHS = ["Books/Thinking.epub", "Papers/cap.pdf"];
const texts = (nodes: DomNode[]) => nodes.map((el) => el.textContent);
/** The books standing on the shelves (#820), by id — the desk's are not among them. */
const shelved = (content: DomNode) => content.byClass("shelf-book").map((el) => el.attrs["data-shelf-id"]);

describe("the bar that stays (#819)", () => {
    it("holds the search, one row of chips, the order and covers or spines — in that order, once", async () => {
        const { view, content } = mount(PATHS, { library });
        await view.onOpen();
        const bars = content.byClass("shelf-bar");
        expect(bars).toHaveLength(1);
        const bar = bars[0];
        for (const cls of ["shelf-heading", "shelf-search", "shelf-chips", "shelf-sort", "shelf-view-switch"]) expect(bar.byClass(cls)).toHaveLength(1);
        expect(bar.oneByClass("shelf-search-input").attrs.placeholder).toBe("Search titles and authors");
        expect(texts(bar.byClass("shelf-filter")).filter((text) => text?.startsWith("All"))).toHaveLength(1);
        // The shelf chips carry no counts; a shelf with nothing on it is not drawn.
        expect(texts(bar.byClass("shelf-filter--status"))).toEqual(["Every shelf", "Reading", "On the shelf"]);
        expect(content.byClass("shelf-subtitle")).toHaveLength(0);
        expect(content.byClass("shelf-filter--collection")).toHaveLength(0);
    });

    it("filters to On the shelf: the books never opened", async () => {
        const { view, content } = mount(PATHS, { library });
        await view.onOpen();
        content.byClass("shelf-filter--status").find((el) => el.textContent === "On the shelf")!.click();
        expect(shelved(content)).toEqual(["Papers/cap.pdf"]);
        expect(view.getState()).toMatchObject({ status: "none" });
    });

    it("opens a saved collection on every shelf, and never saves one again (AC-11)", async () => {
        const { view, content } = mount(PATHS, { library });
        await view.onOpen();
        await view.setState({ collection: "Planning" }, {} as never);
        expect(content.byClass("shelf-book").length + content.byClass("shelf-desk-card").length).toBe(2);
        expect(view.getState()).not.toHaveProperty("collection");
    });

    it("finds the search with /, and leaves the key alone while you type or with nothing to search", async () => {
        const { view, content } = mount(PATHS, { library });
        await view.onOpen();
        const input = content.oneByClass("shelf-search-input");
        const focus = jest.spyOn(input, "focus");
        expect(press({ view }, "/").defaultPrevented).toBe(true);
        expect(focus).toHaveBeenCalledTimes(1);
        const typing = press({ view }, "/", { target: { closest: () => input } });
        expect(typing.defaultPrevented).toBe(false);
        expect(focus).toHaveBeenCalledTimes(1);

        const empty = mount([]);
        await empty.view.onOpen();
        expect(press({ view: empty.view }, "/").defaultPrevented).toBe(false);
    });

    it("turns covers into spines from the bar, and that is the setting's one value (FR-8)", async () => {
        const { view, content, host } = mount(PATHS, { library });
        await view.onOpen();
        const pressed = () => content.byClass("shelf-view-option").filter((el) => el.attrs["aria-pressed"] === "true").map((el) => el.attrs["data-view"]);
        expect(pressed()).toEqual(["covers"]);
        content.byClass("shelf-view-option").find((el) => el.attrs["data-view"] === "spines")!.click();
        expect(host.settings).toMatchObject({ libraryBookView: "spines" });
        expect(host.saveSettings).toHaveBeenCalled();
        expect(pressed()).toEqual(["spines"]);

        const again = mount(PATHS, { library, libraryBookView: "spines" });
        await again.view.onOpen();
        expect(again.content.byClass("shelf-view-option").find((el) => el.attrs["aria-pressed"] === "true")!.attrs["data-view"]).toBe("spines");
    });

    it("puts where articles come from under the bar, never inside it (FR-9)", async () => {
        const { view, content } = mount(PATHS, { library });
        await view.onOpen();
        content.byClass("shelf-filter--kind").find((el) => el.textContent?.startsWith("Articles"))!.click();
        expect(content.oneByClass("shelf-bar").byClass("shelf-articles-from")).toHaveLength(0);
        expect(content.byClass("shelf-articles-from")).toHaveLength(1);
    });
});

describe("the shelves under the bar (#820)", () => {
    it("turns every book on a shelf spine-out, and leaves the desk's cards as they are (AC-20)", async () => {
        const { view, content } = mount(PATHS, { library, libraryBookView: "spines" });
        await view.onOpen();
        expect(content.byClass("shelf-desk-card")).toHaveLength(1);
        const spines = content.byClass("shelf-spine");
        expect(spines).toHaveLength(content.byClass("shelf-book").length);
        expect(spines[0].attrs["data-zf-book"]).toBe("Papers/cap.pdf");
        expect(spines[0].cssProps["--zf-spine-w"]).toMatch(/rem$/);
        expect(content.byClass("shelf-bay--spines")).toHaveLength(1);
    });

    it("keeps where you were along a shelf through a redraw (MF-5)", async () => {
        const { view, content } = mount(PATHS, { library });
        await view.onOpen();
        const row = content.oneByClass("shelf-books") as DomNode & { scrollLeft: number };
        row.scrollLeft = 120;
        row.fire("scroll");
        const input = content.oneByClass("shelf-search-input");
        input.value = "brewer";
        input.fire("input");
        expect((content.oneByClass("shelf-books") as DomNode & { scrollLeft: number }).scrollLeft).toBe(120);
    });

    it("labels each shelf on its plank, with what it holds", async () => {
        const { view, content } = mount(PATHS, { library });
        await view.onOpen();
        const bay = content.oneByClass("shelf-bay");
        expect(bay.attrs["aria-label"]).toBe("On the shelf");
        expect(bay.oneByClass("shelf-plank").oneByClass("shelf-label").textContent).toBe("On the shelfnot started yet");
        expect(bay.oneByClass("shelf-books").attrs.role).toBe("list");
    });
});
