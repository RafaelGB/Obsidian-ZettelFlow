import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const openReader = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock("architecture/components/core/reader/openReader", () => ({ openReader: (...args: unknown[]) => openReader(...args) }));

import { openShelfItem } from "architecture/components/core/library/libraryOpen";
import { openLibrary } from "architecture/components/core/library/openLibrary";
import type { ShelfItem } from "application/library/shelf";

const app = {} as never;

function item(over: Partial<ShelfItem>): ShelfItem {
    return { id: "x", kind: "source", format: "pdf", title: "x", progress: 0, highlights: 0, born: 0, lastRead: 0, ...over } as ShelfItem;
}

describe("opening what is on the shelf (#680, #681)", () => {
    beforeEach(() => openReader.mockClear());

    it("opens a saved path at the chapter it was left on, or where it is asked to", () => {
        const path = item({ kind: "path", format: "path", seed: "n/a.md", paths: ["n/a.md", "n/b.md"], title: "A walk" });
        const host = { settings: { readerResume: {} } } as never;
        expect(openShelfItem(app, path, host)).toBe(true);
        expect(openReader.mock.calls[0][1]).toMatchObject({ seed: "n/a.md", kind: "selection", chapter: 0, name: "A walk" });
        openShelfItem(app, path, null, { chapter: 1, highlight: "h1" });
        expect(openReader.mock.calls[1][1]).toMatchObject({ chapter: 1, highlight: "h1" });
    });

    it("opens a source at its page, or at one highlight", () => {
        expect(openShelfItem(app, item({ file: "P/a.pdf", place: 4 }), null)).toBe(true);
        expect(openReader.mock.calls[0][1]).toMatchObject({ seed: "P/a.pdf", source: "P/a.pdf", chapter: 4 });
        expect(openReader.mock.calls[0][1]).not.toHaveProperty("highlight");
        openShelfItem(app, item({ file: "B/b.epub", format: "epub" }), null, { highlight: "h2" });
        expect(openReader.mock.calls[1][1]).toMatchObject({ source: "B/b.epub", chapter: 0, highlight: "h2" });
    });

    it("says no to what it cannot open, so the shelf shows the detail instead", () => {
        expect(openShelfItem(app, item({ kind: "path", format: "path" }), null)).toBe(false);
        expect(openShelfItem(app, item({}), null)).toBe(false);
        expect(openReader).not.toHaveBeenCalled();
    });
});

describe("opening the Library (#680)", () => {
    function workspace(existing: unknown[] = []) {
        const leaf = { setViewState: jest.fn(async (..._args: unknown[]) => undefined) };
        const ws = {
            getLeavesOfType: jest.fn(() => existing),
            getLeaf: jest.fn(() => leaf),
            revealLeaf: jest.fn(async (..._args: unknown[]) => undefined),
        };
        return { ws, leaf };
    }

    it("opens a new tab when none is open, with no detail", async () => {
        const { ws, leaf } = workspace();
        await openLibrary({ workspace: ws } as never);
        expect(ws.getLeaf).toHaveBeenCalledWith("tab");
        expect(leaf.setViewState).toHaveBeenCalledWith({ type: "zettelflow-library", state: {}, active: true });
        expect(ws.revealLeaf).toHaveBeenCalledWith(leaf);
    });

    it("reuses the one already open, and lands on a source's detail", async () => {
        const open = { setViewState: jest.fn(async (..._args: unknown[]) => undefined) };
        const { ws } = workspace([open]);
        await openLibrary({ workspace: ws } as never, "P/a.pdf");
        expect(ws.getLeaf).not.toHaveBeenCalled();
        expect(open.setViewState).toHaveBeenCalledWith({ type: "zettelflow-library", state: { detail: "P/a.pdf" }, active: true });
    });
});
