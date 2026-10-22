import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Component, Notice } from "obsidian";
import { DomNode } from "../../../../support/dashboardDom";
import { FakeEl } from "../../../../support/textDom";
import { rowLabels } from "../../../../support/readerPopover";
import { ReaderHighlights, type HighlightStore, type HighlightView, type LookupActions, type PassageActions, type SelectionInfo, type ThinkMove } from "architecture/components/core/reader/readerHighlights";
import { chapterText } from "architecture/components/core/reader/readerMarks";
import type { Thought, ThoughtQuote } from "application/thinking/thought";

/**
 * **A popover that fits the selection** (#811): the first row always the same, the second what fits
 * this much text, everything else behind *More* — in one order, nothing written by opening it.
 */

const BOOK = "Books/Thinking in Systems.epub";
const LOCATOR = { at: 10, label: "1 · The basics", chapter: "OEBPS/ch01.xhtml" };
const SENTENCE = "A system is more than the sum of its parts";
const PARAGRAPH =
    "A system is an interconnected set of elements that is coherently organized in a way that achieves something. If you look at that definition closely for a minute, you can see that a system must consist of three kinds of things: elements, interconnections, and a function or purpose.";

function chapter(): FakeEl {
    return new FakeEl("div", [new FakeEl("p", [`Stocks ${SENTENCE}. `]), new FakeEl("p", [PARAGRAPH])]);
}

interface Options {
    book?: boolean;
    ai?: boolean;
    lookup?: boolean;
    voices?: boolean;
    marks?: Thought[];
}

function mount(options: Options = {}) {
    const { book = true, ai = false, lookup = false, voices = false, marks = [] } = options;
    const host = new DomNode();
    const body = chapter();
    const kept: Thought[] = [...marks];
    const store = {
        folder: () => "Lab",
        highlightsAbout: jest.fn(async () => kept),
        write: jest.fn(async (text: string, o: { quote?: ThoughtQuote; meaning?: Thought["meaning"]; locator?: unknown }) => {
            const made = { id: `hl-${kept.length + 1}`, at: 1, text, about: BOOK, quote: o.quote, meaning: o.meaning, locator: o.locator } as unknown as Thought;
            kept.push(made);
            return made;
        }),
        save: jest.fn(async () => undefined),
        discard: jest.fn(async () => undefined),
        restore: jest.fn(async () => undefined),
    };
    const gestures: PassageActions = { claim: jest.fn(), link: jest.fn() };
    const lookupActions: LookupActions = { offers: jest.fn(() => ({ lookUp: true, translate: true })), lookUp: jest.fn(), translate: jest.fn() };
    const move = (id: string): ThinkMove => ({ id, label: id === "contradict" ? "reader_move_contradict" : id === "connect" ? "reader_move_connect" : "reader_move_why", run: jest.fn() });
    const moves = [move("contradict"), move("connect"), ...(ai ? [move("why")] : [])];
    const view: HighlightView = {
        app: {} as never,
        host: host as never,
        owner: new Component(),
        scrollTo: jest.fn(),
        onChange: jest.fn(),
        thinkMoves: () => (book ? moves : []),
        passageActions: () => (book ? gestures : null),
        cite: () => (book ? jest.fn() : null),
        lookup: () => (lookup ? lookupActions : null),
        readAloud: () => (voices ? jest.fn() : null),
        // A tall page: every popover has room below.
        pageRoom: () => ({ top: 0, bottom: 2000 }),
    };
    let selection: SelectionInfo | null = null;
    const highlights = new ReaderHighlights(view, {
        store: store as unknown as HighlightStore,
        selection: () => selection,
        headingAt: () => undefined,
        makeMark: (id) => {
            const mark = new FakeEl("mark");
            mark.attrs["data-hl"] = id;
            return mark as never;
        },
        copy: jest.fn(),
        openThink: jest.fn(),
        toNote: jest.fn(),
    });
    const attach = () => highlights.attach(body as never, book ? BOOK : "Notes/systems.md", new Component(), null, book ? LOCATOR : null);
    const select = (words: string) => {
        const start = chapterText(body as never).indexOf(words);
        if (start < 0) throw new Error(`"${words}" is not in the chapter`);
        selection = { start, end: start + words.length, rect: { left: 10, top: 200, width: 30, height: 20 }, clear: jest.fn() };
        body.fire("mouseup");
    };
    const pop = () => host.oneByClass("reader-hl-pop");
    const button = (label: string) => {
        const found = pop().find((el) => el.tag === "button" && el.textContent === label);
        if (!found) throw new Error(`no "${label}" in the popover`);
        return found;
    };
    const more = () => pop().byClass("reader-hl-more-toggle")[0];
    const region = () => pop().byClass("reader-hl-more")[0];
    return { highlights, host, body, store, gestures, lookupActions, moves, attach, select, pop, button, more, region };
}

beforeEach(() => jest.clearAllMocks());

describe("the first row, always the same (#811 FR-1–FR-3, AC-1–AC-3)", () => {
    it("is four dots, Note, Copy and More — whatever is configured", async () => {
        for (const options of [{}, { ai: true, lookup: true, voices: true }]) {
            const m = mount(options);
            await m.attach();
            m.select(SENTENCE);
            expect(rowLabels(m.pop(), "reader-hl-first")).toEqual(["Idea", "Question", "Quote", "To discuss", "Note", "Copy", "More"]);
        }
    });

    it("names each dot for assistive technology and marks the meaning used last", async () => {
        const m = mount();
        await m.attach();
        m.select(SENTENCE);
        const dots = m.pop().byClass("reader-hl-meaning");
        expect(dots.map((d) => d.getAttribute("aria-label"))).toEqual(["Idea", "Question", "Quote", "To discuss"]);
        expect(dots.filter((d) => d.hasClass("is-active")).map((d) => d.getAttribute("data-meaning"))).toEqual(["idea"]);
    });

    it("keeps the passage as a Quote in one write when its dot is pressed", async () => {
        const m = mount();
        await m.attach();
        m.select(SENTENCE);
        m.button("Quote").click();
        await new Promise((resolve) => setImmediate(resolve));
        expect(m.store.write).toHaveBeenCalledTimes(1);
        expect((m.store.write.mock.calls[0][1] as { meaning: string }).meaning).toBe("quote");
    });

    it("opens the note box from Note, as Highlight and note did", async () => {
        const m = mount();
        await m.attach();
        m.select(SENTENCE);
        m.button("Note").click();
        expect(m.host.find((el) => el.tag === "textarea")).toBeDefined();
    });
});

describe("the second row: what fits this selection (#811 FR-4, FR-5, AC-5, AC-6)", () => {
    it("reads Look up, Translate, Link for a word; Claim, Link, Cite for a sentence; Cite, Read aloud, Claim for a paragraph", async () => {
        const m = mount({ ai: true, lookup: true, voices: true });
        await m.attach();
        m.select("Stocks");
        expect(rowLabels(m.pop(), "reader-hl-second")).toEqual(["Look up", "Translate", "Link to an idea"]);
        m.select(SENTENCE);
        expect(rowLabels(m.pop(), "reader-hl-second")).toEqual(["Claim", "Link to an idea", "Cite"]);
        m.select(PARAGRAPH);
        expect(rowLabels(m.pop(), "reader-hl-second")).toEqual(["Cite", "Read aloud", "Claim"]);
    });

    it("promotes nothing into a reading of notes: no Claim, no Cite, nothing in their place", async () => {
        const m = mount({ book: false });
        await m.attach();
        m.select(SENTENCE);
        expect(m.pop().byClass("reader-hl-second")).toHaveLength(0);
        // Nothing else to show: no More either — never an empty list behind a button.
        expect(m.more()).toBeUndefined();
        expect(rowLabels(m.pop(), "reader-hl-first")).toEqual(["Idea", "Question", "Quote", "To discuss", "Note", "Copy"]);
    });
});

describe("More: everything else, in one order, in place (#811 FR-7–FR-9, AC-7–AC-9)", () => {
    it("hides the Think moves until More is pressed, then shows every action once, in order", async () => {
        const m = mount({ lookup: true, voices: true });
        await m.attach();
        m.select(SENTENCE);
        expect(m.region().getAttribute("hidden")).toBe("");
        expect(m.more().getAttribute("aria-expanded")).toBe("false");
        m.more().click();
        expect(m.region().getAttribute("hidden")).toBeNull();
        expect(m.more().getAttribute("aria-expanded")).toBe("true");
        expect(rowLabels(m.pop(), "reader-hl-more-list")).toEqual(["Look up", "Translate", "Read aloud"]);
        expect(rowLabels(m.pop(), "reader-hl-think")).toEqual(["Contradict", "Connect"]);
        const all = m.pop().findAll((el) => el.tag === "button").map((b) => b.textContent);
        expect(new Set(all).size).toBe(all.length);
    });

    it("adds the AI's moves after Contradict and Connect while AI is on", async () => {
        const m = mount({ ai: true });
        await m.attach();
        m.select(SENTENCE);
        m.more().click();
        expect(rowLabels(m.pop(), "reader-hl-think")).toEqual(["Contradict", "Connect", "Why?"]);
    });

    it("writes nothing and says nothing when it opens and folds", async () => {
        const notice = jest.spyOn(Notice.prototype as never, "setMessage" as never);
        const m = mount({ ai: true });
        await m.attach();
        m.select(SENTENCE);
        for (let i = 0; i < 4; i++) m.more().click();
        expect(m.store.write).not.toHaveBeenCalled();
        expect(m.store.save).not.toHaveBeenCalled();
        expect(m.gestures.claim).not.toHaveBeenCalled();
        expect(notice).not.toHaveBeenCalled();
        expect(m.highlights.hasPopover()).toBe(true);
    });

    it("runs a move from More exactly as the Think row did", async () => {
        const m = mount();
        await m.attach();
        m.select(SENTENCE);
        m.more().click();
        m.button("Contradict").click();
        expect(m.moves[0].run).toHaveBeenCalledTimes(1);
        expect(m.highlights.hasPopover()).toBe(false);
    });
});

describe("the keyboard (#811 FR-11–FR-13, AC-11–AC-13)", () => {
    it("folds More on the first Esc, focus back on it, and closes the popover on the second", async () => {
        const m = mount();
        await m.attach();
        m.select(SENTENCE);
        m.more().click();
        const focus = jest.spyOn(m.more(), "focus");
        m.highlights.escapePopover();
        expect(m.highlights.hasPopover()).toBe(true);
        expect(m.more().getAttribute("aria-expanded")).toBe("false");
        expect(focus).toHaveBeenCalled();
        m.highlights.escapePopover();
        expect(m.highlights.hasPopover()).toBe(false);
    });

    it("enters the popover on Tab, and walks it with the arrows", async () => {
        const m = mount();
        await m.attach();
        m.select(SENTENCE);
        const buttons = m.pop().byClass("reader-hl-first")[0].findAll((el) => el.tag === "button");
        const first = jest.spyOn(buttons[0], "focus");
        expect(m.highlights.focusInPopover(null)).toBe(true);
        expect(first).toHaveBeenCalled();
        const right = jest.spyOn(buttons[1], "focus");
        const event = m.pop().fire("keydown", { key: "ArrowRight", target: buttons[0] });
        expect(right).toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(true);
        const second = m.pop().byClass("reader-hl-second")[0].findAll((el) => el.tag === "button");
        const down = jest.spyOn(second[1], "focus");
        m.pop().fire("keydown", { key: "ArrowDown", target: buttons[1] });
        expect(down).toHaveBeenCalled();
        // Already in it: Tab is the app's again.
        expect(m.highlights.focusInPopover(buttons[0] as never)).toBe(false);
    });

    it("keeps 1–4 working while the popover is up", async () => {
        const m = mount();
        await m.attach();
        m.select(SENTENCE);
        expect(m.highlights.chooseMeaning(1)).toBe(true);
        await new Promise((resolve) => setImmediate(resolve));
        expect((m.store.write.mock.calls[0][1] as { meaning: string }).meaning).toBe("question");
    });
});

describe("a highlight's own popover (#811 D1, AC-17)", () => {
    const marked = { id: "h1", at: 1, text: "", about: BOOK, quote: { exact: SENTENCE, prefix: "Stocks ", suffix: "." }, locator: LOCATOR, meaning: "quote" } as unknown as Thought;

    it("shows its dots with its meaning marked, Add note, More; then Open in Think and Delete; the rest in More", async () => {
        const m = mount({ marks: [marked] });
        await m.attach();
        m.body.all("mark")[0].fire("click");
        expect(rowLabels(m.pop(), "reader-hl-first")).toEqual(["Idea", "Question", "Quote", "To discuss", "Add a note", "More"]);
        expect(m.pop().byClass("reader-hl-meaning").filter((d) => d.hasClass("is-active")).map((d) => d.getAttribute("data-meaning"))).toEqual(["quote"]);
        expect(rowLabels(m.pop(), "reader-hl-second")).toEqual(["Open in Think", "Delete"]);
        m.more().click();
        expect(rowLabels(m.pop(), "reader-hl-more-list")).toEqual(["Claim", "Link to an idea", "Crystallize into a note", "Cite", "Reading", "Reflection", "Research"]);
        expect(rowLabels(m.pop(), "reader-hl-think")).toEqual(["Contradict", "Connect"]);
    });

    /** Not only a scroll takes it away: you look away from it, as from any popover. */
    describe("goes when you look away", () => {
        const noted = { ...marked, text: "Stocks are memory." } as Thought;
        const open = async () => {
            const m = mount({ marks: [noted] });
            const doc = new DomNode();
            (m.body as FakeEl & { ownerDocument: unknown }).ownerDocument = doc;
            await m.attach();
            const mark = m.body.all("mark")[0];
            mark.fire("click");
            expect(m.highlights.hasPopover()).toBe(true);
            return { ...m, doc, mark };
        };

        it("closes on a click or a tap anywhere outside it", async () => {
            for (const pointerType of ["mouse", "touch", "pen"]) {
                const m = await open();
                m.doc.fire("pointerdown", { pointerType, target: new DomNode() });
                expect(m.highlights.hasPopover()).toBe(false);
            }
        });

        it("stays for a press inside it, so its buttons still work", async () => {
            const m = await open();
            m.doc.fire("pointerdown", { target: m.button("Open in Think") });
            expect(m.highlights.hasPopover()).toBe(true);
        });

        it("closes on a second tap on its own highlight, rather than opening again", async () => {
            const m = await open();
            m.doc.fire("pointerdown", { pointerType: "touch", target: m.mark });
            expect(m.highlights.hasPopover()).toBe(true);
            m.mark.fire("click");
            expect(m.highlights.hasPopover()).toBe(false);
        });

        it("closes on Esc the Reader's own keys did not take (its tab not the active one)", async () => {
            const m = await open();
            const esc = m.doc.fire("keydown", { key: "Escape" });
            expect(m.highlights.hasPopover()).toBe(false);
            expect(esc.defaultPrevented).toBe(true);
        });

        it("leaves an Esc the Reader already took alone: one step per key, never two", async () => {
            const m = await open();
            m.doc.fire("keydown", { key: "Escape", defaultPrevented: true });
            expect(m.highlights.hasPopover()).toBe(true);
        });

        it("keeps a note being written: a stray tap does not throw the draft away", async () => {
            const m = await open();
            m.button("Edit note").click();
            m.doc.fire("pointerdown", { pointerType: "touch", target: new DomNode() });
            expect(m.highlights.hasPopover()).toBe(true);
        });

        it("listens to nothing once it has gone", async () => {
            const m = await open();
            m.doc.fire("pointerdown", { target: new DomNode() });
            expect(m.doc.listeners.pointerdown?.length ?? 0).toBe(1); // the chapter's own pointer reader
            expect(m.doc.listeners.keydown?.length ?? 0).toBe(0);
        });
    });
});
