import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Component } from "obsidian";
import { DomNode, flush } from "../../../../support/dashboardDom";
import { FakeEl } from "../../../../support/textDom";
import { ReaderHighlights, type HighlightDeps, type HighlightStore, type SelectionInfo } from "architecture/components/core/reader/readerHighlights";
import { chapterText } from "architecture/components/core/reader/readerMarks";
import type { Thought, ThoughtQuote } from "application/thinking/thought";

/** <h2>Events</h2><p>Event sourcing stores <b>changes</b>, not state.</p><p>Replay rebuilds it.</p> */
function chapter(): FakeEl {
    return new FakeEl("div", [
        new FakeEl("h2", ["Events"]),
        new FakeEl("p", ["Event sourcing stores ", new FakeEl("b", ["changes"]), ", not state."]),
        new FakeEl("p", ["Replay rebuilds it."]),
    ]);
}

function thought(id: string, quote: ThoughtQuote, text = ""): Thought {
    return { id, path: `Lab/${id}.md`, at: "2026-10-05T10:00:00Z", text, about: "Notes/es.md", quote } as unknown as Thought;
}

/** A thought store in memory: what was kept, discarded and brought back. */
function memoryStore(initial: Thought[] = []) {
    const kept: Thought[] = [...initial];
    let next = 0;
    const store = {
        folder: () => "Lab",
        highlightsAbout: jest.fn(async (path: string) => kept.filter((t) => t.about === path)),
        write: jest.fn(async (text: string, options: { about?: string; quote?: ThoughtQuote; meaning?: Thought["meaning"] }) => {
            const made = { ...thought(`hl-${++next}`, options.quote as ThoughtQuote, text), ...(options.meaning ? { meaning: options.meaning } : {}) };
            kept.push(made);
            return made;
        }),
        save: jest.fn(async (t: Thought) => {
            kept.splice(
                kept.findIndex((k) => k.id === t.id),
                1,
                t
            );
        }),
        discard: jest.fn(async (t: Thought) => {
            kept.splice(
                kept.findIndex((k) => k.id === t.id),
                1
            );
        }),
        restore: jest.fn(async (t: Thought) => {
            kept.push(t);
        }),
    };
    return store;
}

function mount(initial: Thought[] = [], extra: Partial<HighlightDeps> = {}) {
    const store = memoryStore(initial);
    const host = new DomNode();
    const margin = new DomNode();
    const body = chapter();
    const owner = new Component();
    const component = new Component();
    let selection: SelectionInfo | null = null;
    const openThink = jest.fn();
    const copy = jest.fn();
    const highlights = new ReaderHighlights(
        { app: {} as never, host: host as never, owner, scrollTo: jest.fn(), onChange: jest.fn() },
        {
            store: store as HighlightStore,
            selection: () => selection,
            headingAt: () => "Events",
            makeMark: (id) => {
                const mark = new FakeEl("mark");
                mark.attrs["data-hl"] = id;
                return mark as never;
            },
            openThink,
            copy,
            ...extra,
        }
    );
    const select = (words: string) => {
        const start = chapterText(body as never).indexOf(words);
        selection = { start, end: start + words.length, rect: { left: 10, top: 20, width: 30 }, clear: jest.fn() };
    };
    const attach = () => highlights.attach(body as never, "Notes/es.md", component, margin as never);
    const button = (label: string): DomNode => {
        const found = host.find((el) => el.tag === "button" && el.textContent === label);
        if (!found) throw new Error(`no "${label}" button in the popover`);
        return found;
    };
    const marks = () => body.all("mark");
    return { highlights, store, host, margin, body, select, attach, openThink, copy, button, marks };
}

beforeEach(() => jest.clearAllMocks());

describe("a selection becomes a highlight in Think (#671)", () => {
    it("offers highlight, highlight and note, and copy when words are selected", async () => {
        const m = mount();
        await m.attach();
        m.select("stores changes");
        m.body.fire("mouseup");
        expect(m.highlights.hasPopover()).toBe(true);
        for (const label of ["Idea", "Question", "Quote", "To discuss", "Highlight and note", "Copy"]) expect(m.button(label)).toBeDefined();
    });

    it("lets the popover go when the page scrolls under it (#667)", async () => {
        const m = mount();
        await m.attach();
        m.select("stores changes");
        m.body.fire("mouseup");
        m.highlights.onScroll();
        expect(m.highlights.hasPopover()).toBe(false);
    });

    it("keeps the passage as a thought about the note, and draws it over the chapter", async () => {
        const m = mount();
        await m.attach();
        const before = chapterText(m.body as never);
        m.select("stores changes");
        m.body.fire("mouseup");
        m.button("Idea").click();
        await flush();
        expect(m.store.write).toHaveBeenCalledWith("", {
            about: "Notes/es.md",
            quote: expect.objectContaining({ exact: "stores changes", heading: "Events" }),
            meaning: "idea",
        });
        const quote = m.store.write.mock.calls[0][1].quote as ThoughtQuote;
        expect(quote.prefix.endsWith("Event sourcing ")).toBe(true);
        expect(quote.suffix.startsWith(", not state.")).toBe(true);
        expect(m.marks().map((mark) => mark.textContent)).toEqual(["stores ", "changes"]);
        expect(chapterText(m.body as never)).toBe(before); // the words are untouched
        expect(m.margin.textContent).toContain("stores changes");
        expect(m.button("Undo")).toBeDefined();
    });

    it("H highlights the current selection; nothing selected, nothing kept", async () => {
        const m = mount();
        await m.attach();
        expect(m.highlights.highlightCurrent()).toBe(false);
        m.select("Replay");
        expect(m.highlights.highlightCurrent()).toBe(true);
        await flush();
        expect(m.store.write).toHaveBeenCalledTimes(1);
    });

    it("a highlight with a note writes the note as the thought's text", async () => {
        const m = mount();
        await m.attach();
        m.select("Replay rebuilds it");
        m.body.fire("mouseup");
        m.button("Highlight and note").click();
        const area = m.host.find((el) => el.tag === "textarea") as DomNode;
        area.value = "  this is the whole point  ";
        m.button("Save").click();
        await flush();
        expect(m.store.write).toHaveBeenCalledWith("this is the whole point", expect.objectContaining({ about: "Notes/es.md" }));
        expect(m.marks()[0].hasClass("zettelkasten-flow__reader-highlight--noted")).toBe(true);
    });

    it("keeps the passage marked while its note is written — the selection goes when the box takes focus", async () => {
        const m = mount();
        await m.attach();
        const before = chapterText(m.body as never);
        m.select("Replay rebuilds it");
        m.body.fire("mouseup");
        m.button("Highlight and note").click();
        // Typing moves the selection into the box; the passage stays marked meanwhile.
        expect(m.marks().map((mark) => mark.textContent)).toEqual(["Replay rebuilds it"]);
        expect(m.marks()[0].hasClass("zettelkasten-flow__reader-highlight--pending")).toBe(true);
        m.body.fire("mouseup"); // a stray mouseup while the box is open changes nothing
        expect(m.marks()).toHaveLength(1);
        (m.host.find((el) => el.tag === "textarea") as DomNode).value = "why";
        m.button("Save").click();
        await flush();
        // Saved, it is one highlight — the provisional mark gave way to the real one.
        expect(m.marks()).toHaveLength(1);
        expect(m.marks()[0].hasClass("zettelkasten-flow__reader-highlight--pending")).toBe(false);
        expect(chapterText(m.body as never)).toBe(before);
    });

    it("takes the provisional mark off again when the note is cancelled", async () => {
        const m = mount();
        await m.attach();
        const before = chapterText(m.body as never);
        m.select("Replay rebuilds it");
        m.body.fire("mouseup");
        m.button("Highlight and note").click();
        m.button("Cancel").click();
        expect(m.marks()).toHaveLength(0);
        expect(chapterText(m.body as never)).toBe(before);
        expect(m.store.write).not.toHaveBeenCalled();
    });

    it("keeps a passage with the meaning you chose, drawn in its colour (#720)", async () => {
        const m = mount();
        await m.attach();
        m.select("Replay rebuilds it");
        m.body.fire("mouseup");
        m.button("Question").click();
        await flush();
        expect(m.store.write).toHaveBeenCalledWith("", expect.objectContaining({ meaning: "question" }));
        expect(m.marks()[0].hasClass("zettelkasten-flow__reader-highlight--question")).toBe(true);
        // H keeps the next one with the meaning used last.
        m.select("stores changes");
        expect(m.highlights.highlightCurrent()).toBe(true);
        await flush();
        expect(m.store.write.mock.calls[1][1]).toEqual(expect.objectContaining({ meaning: "question" }));
    });

    it("1–4 keep the selection with that meaning while the popover is up, and do nothing otherwise (#720)", async () => {
        const m = mount();
        await m.attach();
        expect(m.highlights.chooseMeaning(2)).toBe(false);
        m.select("Replay");
        m.body.fire("mouseup");
        expect(m.highlights.chooseMeaning(3)).toBe(true);
        await flush();
        expect(m.store.write).toHaveBeenCalledWith("", expect.objectContaining({ meaning: "discuss" }));
    });

    it("reads a highlight made before meanings as an idea, and filters the margin by meaning (#720)", async () => {
        const old = thought("h-old", { exact: "Replay rebuilds it", prefix: "", suffix: "" });
        const asked = { ...thought("h-q", { exact: "stores changes", prefix: "", suffix: "" }), meaning: "question" as const };
        const m = mount([old, asked]);
        await m.attach();
        expect(m.marks().some((mark) => mark.hasClass("zettelkasten-flow__reader-highlight--idea"))).toBe(true);
        const chips = m.margin.findAll((el) => el.tag === "button" && el.classes.has("zettelkasten-flow__reader-hl-filter-chip"));
        expect(chips.map((chip) => chip.textContent)).toEqual(["All2", "Idea1", "Question1"]);
        chips[2].click();
        const items = m.margin.findAll((el) => el.classes.has("zettelkasten-flow__reader-hl-item"));
        expect(items).toHaveLength(1);
        expect(items[0].classes.has("zettelkasten-flow__reader-hl-item--question")).toBe(true);
    });

    it("changes what a highlight means from its popover, and the marks follow (#720)", async () => {
        const m = mount([thought("h1", { exact: "Replay rebuilds it", prefix: "", suffix: "" })]);
        await m.attach();
        m.marks()[0].fire("click");
        m.button("Quote").click();
        await flush();
        expect(m.store.save).toHaveBeenCalledWith(expect.objectContaining({ id: "h1", meaning: "quote" }));
        expect(m.marks()[0].hasClass("zettelkasten-flow__reader-highlight--quote")).toBe(true);
        expect(m.marks()[0].hasClass("zettelkasten-flow__reader-highlight--idea")).toBe(false);
    });

    it("undo takes the thought to the trash and the marks off the page", async () => {
        const m = mount();
        await m.attach();
        const before = chapterText(m.body as never);
        m.select("stores changes");
        m.highlights.highlightCurrent();
        await flush();
        m.button("Undo").click();
        await flush();
        expect(m.store.discard).toHaveBeenCalledTimes(1);
        expect(m.marks()).toHaveLength(0);
        expect(chapterText(m.body as never)).toBe(before);
        expect(m.highlights.items()).toHaveLength(0);
    });

    it("copy copies the passage and writes nothing", async () => {
        const m = mount();
        await m.attach();
        m.select("Replay");
        m.body.fire("mouseup");
        m.button("Copy").click();
        expect(m.copy).toHaveBeenCalledWith(m.body, "Replay");
        expect(m.store.write).not.toHaveBeenCalled();
    });
});

describe("highlights are found again on every visit (#671)", () => {
    const anchored = () => thought("a", { exact: "Replay rebuilds", prefix: "not state.", suffix: " it." }, "the point");
    const lost = () => thought("b", { exact: "a passage that was edited away", prefix: "", suffix: "" });

    it("draws what still matches and lists what does not as detached", async () => {
        const m = mount([anchored(), lost()]);
        await m.attach();
        expect(m.highlights.items().map((t) => t.id)).toEqual(["a"]);
        expect(m.highlights.detachedItems().map((t) => t.id)).toEqual(["b"]);
        expect(m.marks().map((mark) => mark.textContent)).toEqual(["Replay rebuilds"]);
        expect(m.margin.textContent).toContain("Detached");
        expect(m.margin.textContent).toContain("a passage that was edited away");
    });

    it("a click on a mark shows its note; edit saves the thought, delete discards it, undo restores", async () => {
        const m = mount([anchored()]);
        await m.attach();
        // Inside a link the mark wins: its click goes no further, to no peek and no navigation (#667).
        const evt = m.marks()[0].fire("click");
        expect(evt.propagationStopped).toBe(true);
        expect(evt.defaultPrevented).toBe(true);
        expect(m.host.textContent).toContain("the point");
        m.button("Edit note").click();
        (m.host.find((el) => el.tag === "textarea") as DomNode).value = "a sharper point";
        m.button("Save").click();
        await flush();
        expect(m.store.save).toHaveBeenCalledWith(expect.objectContaining({ id: "a", text: "a sharper point" }));
        m.marks()[0].fire("click");
        m.button("Delete").click();
        await flush();
        expect(m.store.discard).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
        expect(m.marks()).toHaveLength(0);
        m.button("Undo").click();
        await flush();
        expect(m.store.restore).toHaveBeenCalledTimes(1);
        expect(m.marks()).toHaveLength(1);
    });

    it("open in Think opens Think about the note", async () => {
        const m = mount([anchored()]);
        await m.attach();
        m.marks()[0].fire("click");
        m.button("Open in Think").click();
        expect(m.openThink).toHaveBeenCalledWith({}, "Notes/es.md");
    });

    it("a deep link scrolls to its highlight and makes it flash", async () => {
        const m = mount([anchored()]);
        await m.attach();
        expect(m.highlights.reveal("a")).toBe(true);
        expect(m.marks()[0].hasClass("zettelkasten-flow__reader-highlight--flash")).toBe(true);
        expect(m.highlights.reveal("nope")).toBe(false);
    });
});

describe("highlights in a PDF or an EPUB (#681)", () => {
    const BOOK = "Books/es.pdf";
    const on = (id: string, at: number, exact: string, text = ""): Thought =>
        ({ ...thought(id, { exact, prefix: "", suffix: "" }, text), about: BOOK, locator: { at, label: `p. ${at + 1}` } }) as Thought;
    const note = (id: string, at: number, text: string): Thought =>
        ({ id, at: 1, text, links: [], about: BOOK, locator: { at, label: `p. ${at + 1}` } }) as Thought;

    it("finds a source's passages only on their own page, and lists the page's margin notes", async () => {
        const m = mount([on("a", 2, "stores changes"), on("b", 5, "Replay rebuilds"), note("n", 2, "scan this later"), note("x", 4, "other page")]);
        await m.highlights.attach(m.body as never, BOOK, new Component(), m.margin as never, { at: 2, label: "p. 3" });
        expect(m.highlights.items().map((t) => t.id)).toEqual(["a"]);
        expect(m.highlights.detachedItems()).toEqual([]);
        expect(m.margin.textContent).toContain("Notes on this page");
        expect(m.margin.textContent).toContain("scan this later");
        expect(m.margin.textContent).not.toContain("other page");
    });

    it("keeps a passage with its place in the source, cited under the page when it has no heading", async () => {
        const m = mount();
        await m.highlights.attach(m.body as never, BOOK, new Component(), m.margin as never, { at: 6, label: "p. 7" });
        m.select("Replay rebuilds");
        m.body.fire("mouseup");
        m.button("Idea").click();
        await flush();
        expect(m.store.write).toHaveBeenCalledWith("", expect.objectContaining({ about: BOOK, locator: { at: 6, label: "p. 7" } }));
    });

    it("keeps a note in the margin of a page with no text, with Undo", async () => {
        const m = mount();
        await m.highlights.attach(m.body as never, BOOK, new Component(), m.margin as never, { at: 0, label: "p. 1" });
        m.highlights.notePage(new DomNode() as never);
        const area = m.host.find((el) => el.tag === "textarea") as DomNode;
        area.value = "the diagram on this page";
        m.button("Save").click();
        await flush();
        expect(m.store.write).toHaveBeenCalledWith("the diagram on this page", { about: BOOK, locator: { at: 0, label: "p. 1" } });
        expect(m.margin.textContent).toContain("the diagram on this page");
        m.button("Undo").click();
        await flush();
        expect(m.store.discard).toHaveBeenCalledTimes(1);
        expect(m.margin.textContent).not.toContain("the diagram on this page");
    });

    it("never shows a note's highlights in a source, nor a source's in a note", async () => {
        const m = mount([on("a", 0, "stores changes")]);
        await m.highlights.attach(m.body as never, BOOK, new Component(), m.margin as never);
        expect(m.highlights.items()).toEqual([]);
    });

    it("offers to crystallize a source's highlight into a note — and only a source's (#683)", async () => {
        const toNote = jest.fn();
        const m = mount([on("a", 2, "stores changes", "flows")], { toNote });
        await m.highlights.attach(m.body as never, BOOK, new Component(), m.margin as never, { at: 2, label: "p. 3" });
        m.marks()[0].fire("click", { preventDefault: () => undefined, stopPropagation: () => undefined });
        m.button("Crystallize into a note").click();
        expect(toNote).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "a" }));
        expect(m.highlights.hasPopover()).toBe(false);
    });
});
