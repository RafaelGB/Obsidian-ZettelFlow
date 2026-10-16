/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest } from "@jest/globals";
import { Menu, TFile, WorkspaceLeaf } from "obsidian";
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

/** Where each book stands (#820): the desk, then each shelf by its status, in the order drawn. */
const stands = (content: DomNode) => [
    ["desk", content.byClass("shelf-desk-card").map((el) => el.attrs["data-shelf-id"])],
    ...content.byClass("shelf-bay").map((bay) => [bay.attrs["data-zf-shelf"], bay.byClass("shelf-book").map((el) => el.attrs["data-shelf-id"])]),
];
/** What a book on a shelf says to a screen reader. */
const label = (content: DomNode, id: string) => content.byClass("shelf-book").find((el) => el.attrs["data-shelf-id"] === id)!.oneByClass("shelf-book-open").attrs["aria-label"];

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
        expect(stands(content)[0]).toEqual(["desk", []]);
        expect(content.byClass("shelf-bay").map((el) => el.attrs["data-zf-shelf"])).toEqual(["none"]);
        expect(content.byClass("shelf-book-open").every((el) => el.attrs["aria-label"].endsWith("Not started") || el.attrs["aria-label"].endsWith("read only"))).toBe(true);
    });

    it("reads each note wherever it is kept, and the shelf chips filter by status, without counts (AC-6, AC-12, #819)", async () => {
        const { view, content } = mount({
            "Old folder/cap.md": { book: `[[${PAPER}]]`, title: "Brewer's conjecture, proved", status: "to-read", collections: ["Planning"] },
            "Library/Thinking.md": { book: `[[${BOOK}]]`, status: "finished", collections: ["Planning", "Decisions"] },
        });
        await view.onOpen();
        expect(texts(content, "shelf-filter--status")).toEqual(["Every shelf", "Want to read", "On the shelf", "Finished"]);
        expect(content.byClass("shelf-filter--collection")).toHaveLength(0);
        // Each book stands in one place: on its first shelf of yours (#821) — Planning, for both. Decisions
        // stands too, empty: a shelf a book is on, but never first.
        expect(stands(content)).toEqual([["desk", []], ["none", [SCAN]], ["own:Decisions", []], ["own:Planning", [BOOK, PAPER]]]);
        expect(texts(content, "shelf-filter--own")).toEqual(["Decisions", "Planning"]);
        expect(label(content, PAPER)).toBe("Open Brewer's conjecture, proved, Want to read");
        expect(label(content, BOOK)).toBe("Open Thinking, Fast and Slow, Daniel Kahneman, Finished");
        // Filtered by a shelf of yours: every book on it, first or not.
        content.byClass("shelf-filter--own").find((el) => el.textContent === "Decisions")!.click();
        expect(stands(content)).toEqual([["desk", []], ["own:Decisions", [BOOK]]]);
        expect(view.getState()).toMatchObject({ shelf: "Decisions" });

        content.byClass("shelf-filter--status").find((el) => el.textContent === "Want to read")!.click();
        expect(stands(content)).toEqual([["desk", []], ["to-read", [PAPER]]]);
        expect(view.getState()).toMatchObject({ status: "to-read" });
        // A collection is found by the search too (FR-10).
        content.byClass("shelf-filter--status")[0].click();
        const input = content.oneByClass("shelf-search-input");
        input.value = "decisions";
        input.fire("input");
        expect(stands(content)).toEqual([["desk", []], ["own:Planning", [BOOK]]]);
    });

    it("says Finished on a book you read to the end, before it has any note (FR-3)", async () => {
        const { view, content } = mount({}, { library: { ...library, [BOOK]: { ...library[BOOK], done: true } } });
        await view.onOpen();
        expect(label(content, BOOK)).toBe("Open Thinking, Fast and Slow, Daniel Kahneman, Finished");
        // A finished book has the folded corner, never a ribbon.
        const finished = content.byClass("shelf-book").find((el) => el.attrs["data-shelf-id"] === BOOK)!;
        expect(finished.byClass("shelf-fold")).toHaveLength(1);
        expect(finished.byClass("shelf-ribbon")).toHaveLength(0);
        expect(label(content, PAPER)).toBe("Open Brewer's conjecture, Not started");
    });

    it("stands a book you set to Reading before opening it on Reading, with the shortest ribbon — never on the desk (#820)", async () => {
        const { view, content } = mount({ "Library/cap.md": { book: `[[${PAPER}]]`, status: "reading" } });
        await view.onOpen();
        expect(stands(content)).toEqual([["desk", [BOOK]], ["reading", [PAPER]], ["none", [SCAN]]]);
        expect(label(content, PAPER)).toBe("Open Brewer's conjecture, Not started");
        const ribbon = content.byClass("shelf-book").find((el) => el.attrs["data-shelf-id"] === PAPER)!.oneByClass("shelf-ribbon");
        expect(ribbon.cssProps["--zf-shelf-progress"]).toBe("0");
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
        Menu.last!.item("Details").click();
        await flush();
        expect(content.byClass("shelf-details")).toHaveLength(1);
        for (const spy of [app.vault.create, app.vault.modify, app.vault.process, writes.create, writes.edit]) expect(spy).not.toHaveBeenCalled();
    });

    it("carries a book to its new shelf by a translate when its status changes, the others closing the gap (FR-16)", async () => {
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
            expect(stands(content)).toEqual([["desk", [BOOK]], ["to-read", [PAPER]], ["none", [SCAN]]]);
            await view.setState({ detail: BOOK }, {} as never);
            const select = content.oneByClass("shelf-details-status");
            select.value = "finished";
            select.fire("change");
            await flush();
            expect(writes.create).toHaveBeenCalledTimes(1);
            // The book left the desk for Finished; the others closed the gap.
            expect(stands(content)).toEqual([["desk", []], ["to-read", [PAPER]], ["none", [SCAN]], ["finished", [BOOK]]]);
            const moved = record.animations.filter((a) => a.target.attrs?.["data-shelf-id"]);
            expect(new Map(moved.map((a) => [a.target.attrs["data-shelf-id"], a.keyframes[0]]))).toEqual(
                new Map([
                    [PAPER, { transform: "translate(0px, 100px)" }],
                    [SCAN, { transform: "translate(0px, 100px)" }],
                    [BOOK, { transform: "translate(0px, -200px)" }],
                ])
            );
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
            // Read more recently than the paper: first on Want to read.
            expect(stands(content)).toEqual([["desk", []], ["to-read", [BOOK, PAPER]], ["none", [SCAN]]]);
            expect(record.animations).toHaveLength(0);
        } finally {
            record.stop();
            restore();
        }
    });
});
