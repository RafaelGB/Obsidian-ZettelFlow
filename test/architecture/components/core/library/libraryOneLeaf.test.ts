import { describe, it, expect, jest } from "@jest/globals";

const openReader = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock("architecture/components/core/reader/openReader", () => ({ openReader: (...args: unknown[]) => openReader(...args) }));

import { TFile, WorkspaceLeaf } from "obsidian";
import { DomNode } from "../../../../support/dashboardDom";
import { LibraryView } from "architecture/components/core/library/LibraryView";

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
    return { view, content, leaf };
}

const library = {
    "Papers/cap.pdf": { size: 10, mtime: 20, title: "Brewer's conjecture", chapters: 12, chapter: 5, at: Date.now() },
    "Papers/other.pdf": { size: 10, mtime: 20, title: "Another paper", chapters: 3 },
};

/** The shelf keeps its place across a reading (#733, epic #729): the Reader borrows its leaf. */
describe("the Library lends its leaf to the Reader (#733)", () => {
    it("opens a book in its own leaf, carrying the way back: filter, sort, scroll and the book", async () => {
        const { view, content, leaf } = mount(["Papers/cap.pdf", "Papers/other.pdf"], { library });
        await view.onOpen();
        content.byClass("shelf-filter")[2].click(); // Papers
        view.contentEl.scrollTop = 240;
        openReader.mockClear();
        content.byClass("shelf-card-open")[1].click();
        expect(openReader).toHaveBeenCalledTimes(1);
        const request = openReader.mock.calls[0][1] as Record<string, unknown>;
        expect(request.leaf).toBe(leaf);
        expect(request.back).toEqual({ filter: "papers", sort: "recent", scroll: 240, focus: "Papers/other.pdf" });
    });

    it("comes back where it was: the filter, and the shelf scrolled as you left it", async () => {
        const { view } = mount(["Papers/cap.pdf", "Papers/other.pdf"], { library });
        await view.setState({ filter: "papers", scroll: 240, focus: "Papers/other.pdf" }, {} as never);
        await view.onOpen();
        expect(view.contentEl.scrollTop).toBe(240);
        expect(view.getState()).toMatchObject({ filter: "papers" });
        // The book to come back to is a one-shot: it is not kept in the workspace.
        expect(view.getState()).not.toHaveProperty("focus");
    });
});
