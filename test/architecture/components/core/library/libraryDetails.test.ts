/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, afterEach } from "@jest/globals";
import * as obsidian from "obsidian";
import { Component, TFile } from "obsidian";
import { log } from "architecture";
import { DomNode, flush } from "../../../../support/dashboardDom";
import { recordAnimations, reducedMotion } from "../../../../support/motionDom";
import { CHECK_MS, renderDetails, type DetailsParts, type DetailsPort } from "architecture/components/core/library/libraryDetails";
import type { ShelfItem } from "application/library/shelf";

const BOOK = "Books/Thinking, Fast and Slow.epub";

/** Every section drawn, unloaded after its test: its timers go with it. */
const mounted: Component[] = [];
afterEach(() => {
    for (const scope of mounted.splice(0)) scope.unload();
});

function note(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.name = path.split("/").pop() ?? path;
    f.basename = f.name.replace(/\.md$/, "");
    f.extension = "md";
    return f;
}

const unread: ShelfItem = {
    id: BOOK,
    kind: "book",
    format: "epub",
    title: "Thinking, Fast and Slow",
    author: "Daniel Kahneman",
    file: BOOK,
    progress: 0,
    highlights: 0,
    born: 0,
    lastRead: 0,
};

function port(over: Partial<DetailsPort> = {}) {
    let batches = 0;
    const created = note("Library/Thinking, Fast and Slow.md");
    const calls = {
        create: jest.fn(async (request: any) => ({
            file: created,
            batch: `b${++batches}`,
            fields: { book: `[[${request.source}]]`, author: ["Daniel Kahneman"], publisher: "Farrar, Straus and Giroux", ...request.change },
        })),
        edit: jest.fn(async (file: TFile, _change: unknown) => ({ file, batch: `b${++batches}` })),
        adopt: jest.fn(async (file: TFile, _source: string) => ({ file, batch: `b${++batches}` })),
        undo: jest.fn(async (_batch: string) => ({ hadWork: true, done: 1, failed: [] as string[] })),
        noteAt: jest.fn((path: string) => note(path)),
        ...over,
    };
    return calls;
}

function mount(item: ShelfItem = unread, over: Partial<DetailsParts> = {}, writes = port()) {
    const host = new DomNode();
    const suggests: { input: any; choices: (q: string) => unknown[]; chosen: (c: unknown) => void }[] = [];
    const app = {
        workspace: { openLinkText: jest.fn() },
        vault: { getMarkdownFiles: () => [note("Reading/Kahneman.md"), note("Ideas/other.md")] },
        metadataCache: { getFileCache: () => ({ frontmatter: { book: "[[Books/Thinking, Fast and Slow.epub]]", status: "reading", rating: 5 } }) },
    };
    const saved = jest.fn();
    const scope = new Component();
    mounted.push(scope);
    renderDetails(host as never, {
        app: app as never,
        scope,
        item,
        folder: () => "Library",
        collections: () => ["Planning", "Software design"],
        declared: async () => ({}),
        saved,
        port: writes as never,
        suggest: (input, choices, _label, chosen) => suggests.push({ input, choices: choices as never, chosen: chosen as never }),
        ...over,
    });
    const field = (name: string) => host.find((el) => el.attrs.id === `zf-book-${name}`)!;
    return { host, app, saved, writes, scope, suggests, field };
}

/** Type into a field and leave it, the way a reader does. */
function typeAndLeave(input: DomNode, value: string) {
    input.value = value;
    input.fire("blur");
}

describe("Details: the book's note, edited where you look at the book (#743 FR-8)", () => {
    afterEach(() => jest.useRealTimers());

    it("is filled from what the shelf knows before there is a note, and says where it will be kept", () => {
        const { host, field } = mount();
        expect(host.oneByClass("shelf-section").textContent).toBe("Details");
        expect(field("title").value).toBe("Thinking, Fast and Slow");
        expect(field("author").value).toBe("Daniel Kahneman");
        expect(field("year").value).toBe("");
        expect(host.byClass("shelf-details-label").map((el) => el.textContent)).toEqual([
            "Title",
            "Author",
            "Series",
            "Publisher",
            "Year",
            "Language",
            "ISBN",
            "Citation key",
            "Tags",
            "Status",
            "Collections",
        ]);
        expect(host.oneByClass("shelf-details-where").textContent).toBe(
            "Kept in a note of its own in Library, the first time you change something.Use a note you already have"
        );
        // Unread, never set: the status says so, and nothing else is chosen for you.
        expect(host.oneByClass("shelf-details-status").value).toBe("");
    });

    it("creates the note with your first change, on leaving the field, and edits only what changes after (AC-3)", async () => {
        const { host, field, writes, saved } = mount();
        typeAndLeave(field("year"), "2011");
        await flush();
        expect(writes.create).toHaveBeenCalledTimes(1);
        expect(writes.create.mock.calls[0][0]).toMatchObject({ source: BOOK, folder: "Library", title: "Thinking, Fast and Slow", change: { year: 2011 } });
        // The fields you are not in show what the note was filled with.
        expect(field("publisher").value).toBe("Farrar, Straus and Giroux");
        expect(host.oneByClass("shelf-details-note").textContent).toBe("Library/Thinking, Fast and Slow.md");
        expect(saved).toHaveBeenLastCalledWith(expect.objectContaining({ year: 2011 }), "Library/Thinking, Fast and Slow.md");

        // Enter commits too, and leaving the same text again writes nothing.
        field("series").value = "Penguin Psychology";
        field("series").fire("keydown", { key: "Enter", preventDefault: () => undefined });
        await flush();
        field("series").fire("blur");
        await flush();
        expect(writes.create).toHaveBeenCalledTimes(1);
        expect(writes.edit).toHaveBeenCalledTimes(1);
        expect(writes.edit.mock.calls[0][1]).toEqual({ series: "Penguin Psychology" });
    });

    it("never makes two notes from two quick changes", async () => {
        const { field, writes } = mount();
        typeAndLeave(field("year"), "2011");
        typeAndLeave(field("language"), "en");
        await flush();
        expect(writes.create).toHaveBeenCalledTimes(1);
        expect(writes.edit).toHaveBeenCalledTimes(1);
        expect(writes.edit.mock.calls[0][1]).toEqual({ language: "en" });
    });

    it("refuses a year that is not one, on the spot, and writes nothing", async () => {
        const { host, field, writes } = mount();
        typeAndLeave(field("year"), "next spring");
        await flush();
        expect(writes.create).not.toHaveBeenCalled();
        expect(host.oneByClass("shelf-details-error").textContent).toBe("A year is a number, such as 2011.");
        expect(field("year").attrs["aria-invalid"]).toBe("true");
        expect(field("year").value).toBe("next spring");
    });

    it("sets a status from the choice, stored as its stable value", async () => {
        const { host, writes } = mount();
        const select = host.oneByClass("shelf-details-status");
        expect(select.children.map((o) => o.textContent)).toEqual(["Not set", "Want to read", "Reading", "Finished"]);
        select.value = "to-read";
        select.fire("change");
        await flush();
        expect(writes.create.mock.calls[0][0].change).toEqual({ status: "to-read" });
        // Once set, there is nothing left to be "not set".
        expect(select.children.map((o) => o.textContent)).toEqual(["Want to read", "Reading", "Finished"]);
    });

    it("says what is read from your reading, and choosing it still sets it (FR-3)", async () => {
        const { host, writes } = mount({ ...unread, status: "finished", lastRead: 5 });
        const select = host.oneByClass("shelf-details-status");
        expect(select.children.map((o) => o.textContent)).toEqual(["Finished, from your reading", "Want to read", "Reading", "Finished"]);
        expect(select.value).toBe("");
        select.value = "finished";
        select.fire("change");
        await flush();
        expect(writes.create.mock.calls[0][0].change).toEqual({ status: "finished" });
    });

    it("adds a collection as a chip with + Collection and Enter, suggesting the names in use", async () => {
        const item = { ...unread, note: "Library/Thinking, Fast and Slow.md", details: { collections: ["Planning"] } };
        const { host, writes, suggests } = mount(item);
        expect(host.byClass("shelf-details-chip-name").map((el) => el.textContent)).toEqual(["Planning"]);
        host.oneByClass("shelf-details-add").click();
        const input = host.oneByClass("shelf-details-add-input");
        // What is offered: the names in use, but not one the book is already in.
        expect(suggests[0].choices("")).toEqual(["Software design"]);
        input.value = "Decisions";
        input.fire("keydown", { key: "Enter", preventDefault: () => undefined });
        await flush();
        expect(writes.edit.mock.calls[0][1]).toEqual({ collections: ["Planning", "Decisions"] });
        expect(host.byClass("shelf-details-chip-name").map((el) => el.textContent)).toEqual(["Planning", "Decisions"]);
        // And takes one away again.
        host.byClass("shelf-details-chip-remove")[0].click();
        await flush();
        expect(writes.edit.mock.calls[1][1]).toEqual({ collections: ["Decisions"] });
    });

    it("adopts a note you already have, adding only the link (FR-7)", async () => {
        const { host, writes, suggests, saved } = mount();
        host.oneByClass("shelf-details-adopt").click();
        const picked = suggests[0].choices("kahneman") as TFile[];
        expect(picked.map((f) => f.path)).toEqual(["Reading/Kahneman.md"]);
        suggests[0].chosen(picked[0]);
        await flush();
        expect(writes.adopt).toHaveBeenCalledWith(picked[0], BOOK);
        expect(host.oneByClass("shelf-details-note").textContent).toBe("Reading/Kahneman.md");
        expect(host.oneByClass("shelf-details-status").value).toBe("reading");
        expect(saved).toHaveBeenLastCalledWith({ status: "reading" }, "Reading/Kahneman.md");
    });

    it("opens the note from the Saved in line, wherever it is kept (AC-12)", () => {
        const item = { ...unread, note: "Old folder/Thinking.md", details: { status: "finished" as const } };
        const { host, app } = mount(item);
        expect(host.oneByClass("shelf-details-where").textContent).toBe("Saved in Old folder/Thinking.md");
        host.oneByClass("shelf-details-note").click({ preventDefault: () => undefined });
        expect(app.workspace.openLinkText).toHaveBeenCalledWith("Old folder/Thinking.md", "", false);
    });

    it("keeps your text when a write fails and says so in place — never a Notice (FR-15)", async () => {
        const notice = jest.spyOn(obsidian, "Notice");
        const error = jest.spyOn(log, "error");
        const failing = port({ edit: jest.fn(async () => Promise.reject(new Error("disk full"))) as never });
        const item = { ...unread, note: "Library/Thinking, Fast and Slow.md", details: {} };
        const { host, field, saved } = mount(item, {}, failing);
        typeAndLeave(field("publisher"), "FSG");
        await flush();
        expect(field("publisher").value).toBe("FSG");
        expect(host.oneByClass("shelf-details-error").textContent).toBe("Could not save this. Your text is still here.");
        expect(error).toHaveBeenCalled();
        expect(saved).not.toHaveBeenCalled();
        expect(notice).not.toHaveBeenCalled();
        // Leaving it again tries again.
        field("publisher").fire("blur");
        await flush();
        expect(failing.edit).toHaveBeenCalledTimes(2);
        notice.mockRestore();
        error.mockRestore();
    });

    it("takes the last write back from the Saved in line: a creation leaves no note behind", async () => {
        const { host, field, writes, saved } = mount();
        typeAndLeave(field("year"), "2011");
        await flush();
        host.oneByClass("shelf-details-undo").click();
        await flush();
        expect(writes.undo).toHaveBeenCalledWith("b1");
        expect(host.byClass("shelf-details-note")).toHaveLength(0);
        expect(host.oneByClass("shelf-details-adopt")).toBeDefined();
        expect(field("year").value).toBe("");
        expect(host.oneByClass("shelf-details-error").textContent).toBe("Taken back.");
        expect(saved).toHaveBeenLastCalledWith({}, null);
    });
});

describe("Details: saving is felt, not announced (#743 FR-15, FR-16, FR-17)", () => {
    afterEach(() => jest.useRealTimers());

    it("fades a check in beside the field and out after 1.2 s, by opacity alone", async () => {
        const restore = reducedMotion(false);
        const record = recordAnimations();
        try {
            jest.useFakeTimers({ doNotFake: ["setImmediate"] });
            const { field } = mount();
            typeAndLeave(field("year"), "2011");
            await flush();
            const check = field("year").parent!.byClass("shelf-details-check")[0];
            expect(check.hasClass("zettelkasten-flow__shelf-details-check--on")).toBe(true);
            const fadeIn = record.animations.filter((a) => a.target === check);
            expect(fadeIn.map((a) => [a.keyframes, a.options.duration])).toEqual([[[{ opacity: 0 }, { opacity: 1 }], 120]]);
            jest.advanceTimersByTime(CHECK_MS);
            const both = record.animations.filter((a) => a.target === check);
            expect(both[1].keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }]);
            both[1].finish();
            expect(check.hasClass("zettelkasten-flow__shelf-details-check--on")).toBe(false);
            expect(record.keys()).toEqual(new Set(["opacity"]));
        } finally {
            record.stop();
            restore();
        }
    });

    it("drops a new collection's chip in, from 0.96 and clear", async () => {
        const restore = reducedMotion(false);
        const record = recordAnimations();
        try {
            const { host } = mount({ ...unread, note: "Library/T.md", details: {} });
            host.oneByClass("shelf-details-add").click();
            const input = host.oneByClass("shelf-details-add-input");
            input.value = "Planning";
            input.fire("keydown", { key: "Enter", preventDefault: () => undefined });
            await flush();
            const chip = host.oneByClass("shelf-details-chip");
            const drop = record.animations.find((a) => a.target === chip)!;
            expect(drop.keyframes).toEqual([
                { opacity: 0, transform: "scale(0.96)" },
                { opacity: 1, transform: "scale(1)" },
            ]);
            expect(drop.options.duration).toBe(120);
        } finally {
            record.stop();
            restore();
        }
    });

    it("moves nothing under reduced motion, and the check still shows", async () => {
        const restore = reducedMotion(true);
        const record = recordAnimations();
        try {
            jest.useFakeTimers({ doNotFake: ["setImmediate"] });
            const { field } = mount();
            typeAndLeave(field("year"), "2011");
            await flush();
            const check = field("year").parent!.byClass("shelf-details-check")[0];
            expect(check.hasClass("zettelkasten-flow__shelf-details-check--on")).toBe(true);
            expect(record.animations).toHaveLength(0);
            jest.advanceTimersByTime(CHECK_MS);
            expect(check.hasClass("zettelkasten-flow__shelf-details-check--on")).toBe(false);
        } finally {
            record.stop();
            restore();
        }
    });
});
