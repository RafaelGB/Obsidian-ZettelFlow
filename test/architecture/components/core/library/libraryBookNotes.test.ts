/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest } from "@jest/globals";
import { TFile, WorkspaceLeaf } from "obsidian";
import { DomNode, flush } from "../../../../support/dashboardDom";
import { recordAnimations, reducedMotion } from "../../../../support/motionDom";
import { LibraryView } from "architecture/components/core/library/LibraryView";
import { bookNoteOf, bookOfNote, gatherBookNotes } from "architecture/components/core/library/bookNoteIndex";

const DAY = 86_400_000;
const BOOK = "Books/Thinking, Fast and Slow.epub";
const PAPER = "Papers/cap.pdf";
const SCAN = "Papers/scan.pdf";

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
    [BOOK]: { size: 10, mtime: 20, title: "Thinking, Fast and Slow", author: "Daniel Kahneman", chapters: 38, chapter: 2, at: Date.now() - DAY },
    [PAPER]: { size: 10, mtime: 20, title: "Brewer's conjecture", chapters: 12 },
    [SCAN]: { size: 10, mtime: 20, chapters: 4, imageOnly: true },
};

/** The Library over a vault whose book notes live where the test says, read from the metadata cache. */
function mount(notes: Record<string, Record<string, unknown>>, settings: Record<string, unknown> = { library }) {
    const sources = [BOOK, PAPER, SCAN].map(file);
    const markdown = Object.keys(notes).map(file);
    const on = () => ({});
    const app = {
        workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), getActiveFile: () => null, getLastOpenFiles: () => [], on },
        vault: {
            getFiles: () => [...sources, ...markdown],
            getMarkdownFiles: () => markdown,
            getAbstractFileByPath: (path: string) => sources.find((f) => f.path === path) ?? markdown.find((f) => f.path === path) ?? null,
            create: jest.fn(),
            modify: jest.fn(),
            process: jest.fn(),
            on,
        },
        metadataCache: {
            getFileCache: (f: TFile) => (notes[f.path] ? { frontmatter: notes[f.path] } : null),
            getFirstLinkpathDest: (link: string) => sources.find((s) => s.path === link) ?? null,
            on,
        },
    };
    const writes = {
        create: jest.fn(async (request: any) => ({ file: file(`Library/${request.title}.md`), batch: "b1", fields: { book: `[[${request.source}]]`, ...request.change } })),
        edit: jest.fn(async (f: TFile) => ({ file: f, batch: "b2" })),
        adopt: jest.fn(),
        undo: jest.fn(),
        noteAt: (path: string) => file(path),
    };
    const content = new DomNode();
    const host = { settings: { ...settings }, saveSettings: jest.fn(async () => undefined) };
    const view = new LibraryView(new WorkspaceLeaf(app, content), host, { details: { port: writes as never, suggest: () => undefined } });
    return { view, app, content, host, writes };
}

const texts = (content: DomNode, cls: string) => content.byClass(cls).map((el) => el.textContent);

describe("the book's note on the shelf (#743)", () => {
    it("finds a note by its link to the book, never by its folder, and only a link to a PDF or an EPUB", () => {
        const { app } = mount({
            "Old folder/cap.md": { book: `[[${PAPER}]]`, status: "to-read" },
            "Ideas/a.md": { source: `[[${BOOK}]]` },
            "Ideas/b.md": { book: "[[Ideas/a.md]]" },
        });
        const notes = gatherBookNotes(app as never);
        expect([...notes.keys()]).toEqual([PAPER]);
        expect(notes.get(PAPER)?.path).toBe("Old folder/cap.md");
        expect(bookOfNote(app as never, file("Old folder/cap.md"))).toBe(PAPER);
        expect(bookOfNote(app as never, file("Ideas/a.md"))).toBeNull();
        expect(bookNoteOf(app as never, PAPER)).toEqual({ path: "Old folder/cap.md", source: PAPER, details: { status: "to-read" } });
        expect(bookNoteOf(app as never, BOOK)).toBeNull();
    });

    it("shows only Every shelf and On the shelf while no book has a note or a reading, and every card as before (#819)", async () => {
        const { view, content } = mount({}, {});
        await view.onOpen();
        expect(texts(content, "shelf-filter--status")).toEqual(["Every shelf", "On the shelf"]);
        expect(content.byClass("shelf-filter--collection")).toHaveLength(0);
        expect(content.byClass("shelf-shelf--want")).toHaveLength(0);
        expect(content.byClass("shelf-card-status")).toHaveLength(0);
        expect(content.byClass("shelf-meta").filter((el) => el.textContent === "Never opened")).toHaveLength(3);
    });

    it("reads each note wherever it is kept, and the shelf chips filter by status, without counts (AC-6, AC-12, #819)", async () => {
        const { view, content } = mount({
            "Old folder/cap.md": { book: `[[${PAPER}]]`, title: "Brewer's conjecture, proved", status: "to-read", collections: ["Planning"] },
            "Library/Thinking.md": { book: `[[${BOOK}]]`, status: "finished", collections: ["Planning", "Decisions"] },
        });
        await view.onOpen();
        expect(texts(content, "shelf-filter--status")).toEqual(["Every shelf", "Want to read", "On the shelf", "Finished"]);
        expect(content.byClass("shelf-filter--collection")).toHaveLength(0);
        // Want to read follows what you are reading; the paper is in it, and not again below.
        expect(texts(content, "shelf-section")).toEqual(["Want to read", "Your shelf"]);
        expect(content.oneByClass("shelf-shelf--want").byClass("shelf-card-title").map((el) => el.textContent)).toEqual(["Brewer's conjecture, proved"]);
        expect(texts(content, "shelf-card-status")).toEqual(["Want to read", "Finished"]);

        content.byClass("shelf-filter--status").find((el) => el.textContent === "Want to read")!.click();
        expect(texts(content, "shelf-card-title")).toEqual(["Brewer's conjecture, proved"]);
        expect(view.getState()).toMatchObject({ status: "to-read" });
        // A collection is found by the search too (FR-10).
        content.byClass("shelf-filter--status")[0].click();
        const input = content.oneByClass("shelf-search-input");
        input.value = "decisions";
        input.fire("input");
        expect(texts(content, "shelf-card-title")).toEqual(["Thinking, Fast and Slow"]);
    });

    it("says Finished on a book you read to the end, before it has any note (FR-3)", async () => {
        const { view, content } = mount({}, { library: { ...library, [BOOK]: { ...library[BOOK], done: true } } });
        await view.onOpen();
        const card = content.byClass("shelf-card").find((el) => el.attrs["data-shelf-id"] === BOOK)!;
        expect(card.oneByClass("shelf-card-status").textContent).toBe("Finished");
        const paper = content.byClass("shelf-card").find((el) => el.attrs["data-shelf-id"] === PAPER)!;
        expect(paper.byClass("shelf-meta").map((el) => el.textContent)).toContain("Never opened");
    });

    it("says Reading, not Never opened, on a book you set to Reading before opening it", async () => {
        const { view, content } = mount({ "Library/cap.md": { book: `[[${PAPER}]]`, status: "reading" } });
        await view.onOpen();
        const paper = content.byClass("shelf-card").find((el) => el.attrs["data-shelf-id"] === PAPER)!;
        expect(paper.oneByClass("shelf-card-status").textContent).toBe("Reading");
    });

    it("puts Details inside the detail's own sheet, read from the note (FR-14)", async () => {
        const { view, content } = mount({ "Elsewhere/Thinking.md": { book: `[[${BOOK}]]`, publisher: "FSG", status: "reading" } });
        await view.onOpen();
        await view.setState({ detail: BOOK }, {} as never);
        const aside = content.oneByClass("shelf-detail");
        expect(aside.byClass("shelf-details")).toHaveLength(1);
        expect(aside.find((el) => el.attrs.id === "zf-book-publisher")!.value).toBe("FSG");
        expect(aside.oneByClass("shelf-details-where").textContent).toBe("Saved in Elsewhere/Thinking.md");
    });

    it("writes nothing by opening the shelf or a detail (AC-4)", async () => {
        const { view, content, app, writes } = mount({});
        await view.onOpen();
        content.byClass("shelf-more")[0].click();
        await flush();
        expect(content.byClass("shelf-details")).toHaveLength(1);
        for (const spy of [app.vault.create, app.vault.modify, app.vault.process, writes.create, writes.edit]) expect(spy).not.toHaveBeenCalled();
    });

    it("carries a card to its new row by a translate when its status changes, the others closing the gap (FR-16)", async () => {
        const restore = reducedMotion(false);
        const record = recordAnimations();
        // A layout: every card a row below the one before it, in the order the shelf draws them.
        const proto = DomNode.prototype as any;
        const rect = proto.getBoundingClientRect;
        proto.getBoundingClientRect = function (this: DomNode) {
            let root: DomNode = this;
            while (root.parent) root = root.parent;
            const cards = root.findAll((el) => el.attrs["data-shelf-id"] !== undefined);
            return { left: 0, top: cards.indexOf(this) * 100, width: 100, height: 90 };
        };
        try {
            const { view, content, writes } = mount({ "Library/cap.md": { book: `[[${PAPER}]]`, status: "to-read" } });
            await view.onOpen();
            expect(content.byClass("shelf-card").map((el) => el.attrs["data-shelf-id"])).toEqual([PAPER, BOOK, SCAN]);
            await view.setState({ detail: BOOK }, {} as never);
            const select = content.oneByClass("shelf-details-status");
            select.value = "to-read";
            select.fire("change");
            await flush();
            expect(writes.create).toHaveBeenCalledTimes(1);
            // The book joined Want to read, ahead of the paper: it was read more recently.
            expect(content.byClass("shelf-card").map((el) => el.attrs["data-shelf-id"])).toEqual([BOOK, PAPER, SCAN]);
            const moved = record.animations.filter((a) => a.target.attrs?.["data-shelf-id"]);
            expect(moved.map((a) => [a.target.attrs["data-shelf-id"], a.keyframes[0]])).toEqual([
                [BOOK, { transform: "translate(0px, 100px)" }],
                [PAPER, { transform: "translate(0px, -100px)" }],
            ]);
            expect(new Set(moved.flatMap((a) => a.keyframes.flatMap((frame) => Object.keys(frame))))).toEqual(new Set(["transform"]));
            expect(moved.every((a) => a.options.duration === 250)).toBe(true);
        } finally {
            proto.getBoundingClientRect = rect;
            record.stop();
            restore();
        }
    });

    it("changes rows at once under reduced motion", async () => {
        const restore = reducedMotion(true);
        const record = recordAnimations();
        try {
            const { view, content } = mount({ "Library/cap.md": { book: `[[${PAPER}]]`, status: "to-read" } });
            await view.onOpen();
            await view.setState({ detail: BOOK }, {} as never);
            const select = content.oneByClass("shelf-details-status");
            select.value = "to-read";
            select.fire("change");
            await flush();
            expect(content.oneByClass("shelf-shelf--want").byClass("shelf-card").map((el) => el.attrs["data-shelf-id"])).toEqual([BOOK, PAPER]);
            expect(record.animations).toHaveLength(0);
        } finally {
            record.stop();
            restore();
        }
    });
});
