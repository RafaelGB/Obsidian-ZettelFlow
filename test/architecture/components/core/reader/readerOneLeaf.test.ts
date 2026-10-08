import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Platform, type WorkspaceLeaf } from "obsidian";
import { parseReaderState } from "architecture/components/core/reader/readerContract";
import { exitReader, openReader, resetReaderWorkspace } from "architecture/components/core/reader/openReader";

function side(collapsed: boolean) {
    const s = { collapsed, collapse: () => (s.collapsed = true), expand: () => (s.collapsed = false) };
    return s;
}

function workspace(existing: WorkspaceLeaf[] = []) {
    const library = {
        setViewState: jest.fn(async (..._args: unknown[]) => undefined),
        detach: jest.fn(),
    } as unknown as WorkspaceLeaf & { setViewState: jest.Mock; detach: jest.Mock };
    const fresh = { setViewState: jest.fn(async () => undefined) } as unknown as WorkspaceLeaf;
    const ws = {
        leftSplit: side(false),
        rightSplit: side(false),
        getMostRecentLeaf: () => library,
        getLeavesOfType: jest.fn(() => existing),
        getLeaf: jest.fn(() => fresh),
        revealLeaf: jest.fn(async () => undefined),
        iterateAllLeaves: (fn: (leaf: WorkspaceLeaf) => void) => fn(library),
        setActiveLeaf: jest.fn(),
    };
    return { ws, library, fresh };
}

/**
 * The Library and the Reader share one leaf (#733, epic #729): reading a book is a camera move inside
 * the place you are, never a new tab — and leaving it gives that leaf back to the Library as it was.
 */
describe("the Library and the Reader share one leaf (#733)", () => {
    beforeEach(() => {
        resetReaderWorkspace();
        (Platform as { isMobile: boolean }).isMobile = false;
    });

    it("keeps the way back to the shelf in the reader's state, and only what it understands", () => {
        const back = { filter: "reading", sort: "recent", scroll: 320, focus: "B/b.epub" };
        expect(parseReaderState({ source: "B/b.epub", back }).back).toEqual(back);
        expect(parseReaderState({ source: "B/b.epub", back: { scroll: 10, nested: { no: 1 }, fn: null } }).back).toEqual({ scroll: 10 });
        expect(parseReaderState({ source: "B/b.epub", back: "library" }).back).toBeUndefined();
    });

    it("opens the reader in the leaf it is given, with the way back, and opens no tab", async () => {
        const { ws, library } = workspace();
        const back = { filter: "all", scroll: 120 };
        await openReader({ workspace: ws } as never, { seed: "B/b.epub", source: "B/b.epub", leaf: library, back });
        expect(ws.getLeaf).not.toHaveBeenCalled();
        expect(library.setViewState).toHaveBeenCalledWith({
            type: "zettelflow-reader",
            state: { source: "B/b.epub", chapter: 0, back },
            active: true,
        });
    });

    it("closes another reader first: there is only one", async () => {
        const other = { setViewState: jest.fn(), detach: jest.fn() } as unknown as WorkspaceLeaf & { detach: jest.Mock };
        const { ws, library } = workspace([other]);
        await openReader({ workspace: ws } as never, { seed: "B/b.epub", source: "B/b.epub", leaf: library, back: {} });
        expect(other.detach).toHaveBeenCalled();
    });

    it("gives the leaf back to the Library as it was, instead of closing it", async () => {
        const { ws, library } = workspace();
        const back = { filter: "reading", scroll: 120, focus: "B/b.epub" };
        await openReader({ workspace: ws } as never, { seed: "B/b.epub", source: "B/b.epub", leaf: library, back });
        library.setViewState.mockClear();
        exitReader({ workspace: ws } as never, library, back);
        expect(library.detach).not.toHaveBeenCalled();
        expect(library.setViewState).toHaveBeenCalledWith({ type: "zettelflow-library", state: back, active: true });
        expect([ws.leftSplit.collapsed, ws.rightSplit.collapsed]).toEqual([false, false]);
    });

    it("still closes a reader that was not opened from the Library", async () => {
        const { ws, fresh } = workspace();
        await openReader({ workspace: ws } as never, "a.md");
        const leaf = fresh as WorkspaceLeaf & { detach?: jest.Mock };
        leaf.detach = jest.fn();
        exitReader({ workspace: ws } as never, leaf);
        expect(leaf.detach).toHaveBeenCalled();
    });
});
