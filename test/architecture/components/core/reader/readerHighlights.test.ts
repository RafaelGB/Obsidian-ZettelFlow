import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Component } from "obsidian";
import { DomNode, flush } from "../../../../support/dashboardDom";
import { FakeEl } from "../../../../support/textDom";
import { ReaderHighlights, type HighlightStore, type SelectionInfo } from "architecture/components/core/reader/readerHighlights";
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
        write: jest.fn(async (text: string, options: { about?: string; quote?: ThoughtQuote }) => {
            const made = thought(`hl-${++next}`, options.quote as ThoughtQuote, text);
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

function mount(initial: Thought[] = []) {
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
        for (const label of ["Highlight", "Highlight and note", "Copy"]) expect(m.button(label)).toBeDefined();
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
        m.button("Highlight").click();
        await flush();
        expect(m.store.write).toHaveBeenCalledWith("", {
            about: "Notes/es.md",
            quote: expect.objectContaining({ exact: "stores changes", heading: "Events" }),
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
