/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { Component } from "obsidian";
import { DomNode, flush, installBrowserGlobals } from "../../../../support/dashboardDom";
import { FakeEl } from "../../../../support/textDom";
import { recordAnimations, reducedMotion, type AnimationRecord } from "../../../../support/motionDom";
import { ReaderHighlights, type HighlightStore, type SelectionInfo, type ThinkMove } from "architecture/components/core/reader/readerHighlights";
import { ReaderVaultMoves, LOOKING_MS, placeOfPassage, type VaultMovePassage, type VaultMovesView } from "architecture/components/core/reader/readerVaultMoves";
import { MOTION } from "architecture/components/core/reader/readerMotion";
import { chapterText } from "architecture/components/core/reader/readerMarks";
import { buildVocabulary, chapterVerdict, nearPassage } from "architecture/knowledge/state";
import { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import type { Idea } from "architecture/knowledge/model/Idea";
import { MOVE_VERBS, sanitizeMoveLog } from "application/thinking/move";
import { readSourceEntry, samePlace } from "application/library/provenance";
import { AiService } from "architecture/ai/AiService";
import type { Thought, ThoughtQuote } from "application/thinking/thought";

const BOOK = "Books/Thinking, Fast and Slow.epub";
const CHAPTER = "OEBPS/text/ch2.xhtml";

function note(path: string, title: string, relations: { to: string; type?: string }[] = []): Idea {
    return {
        path,
        title,
        created: 0,
        modified: 0,
        state: "permanent",
        relations: relations.map((r) => ({ type: r.type ?? "link", from: path, to: r.to })),
        claims: [],
        maturitySignals: { inDegree: 0, outDegree: relations.length, degree: relations.length, hasSources: false },
    };
}

/** The spec's preconditions: *Ship early* contradicts *Planning fallacy*; *Reference-class forecasting* supports it. */
function vault(): KnowledgeModel {
    const model = new KnowledgeModel();
    model.build([
        note("Notes/Planning fallacy.md", "Planning fallacy"),
        note("Notes/Ship early.md", "Ship early", [{ to: "Notes/Planning fallacy.md", type: "contradicts" }]),
        note("Notes/Reference-class forecasting.md", "Reference-class forecasting", [{ to: "Notes/Planning fallacy.md", type: "supports" }]),
        note("Notes/Optimism bias.md", "Optimism bias"),
    ]);
    return model;
}

const QUOTE: ThoughtQuote = { exact: "This is the planning fallacy, or the planning bias", prefix: "cases. ", suffix: " as some call it" };
const passage = (over: Partial<VaultMovePassage> = {}): VaultMovePassage => ({
    book: BOOK,
    bookTitle: "Thinking, Fast and Slow",
    quote: QUOTE,
    locator: { at: 1, label: "2 · The outside view", chapter: CHAPTER },
    ...over,
});
const FROM = { left: 100, top: 400, width: 80, height: 24 };

function harness(options: { thoughts?: Thought[]; folder?: string; slow?: Promise<Thought[]>; opened?: boolean; cites?: string[] } = {}) {
    const host = new DomNode();
    const model = vault();
    let nearAvailable = true;
    let n = 0;
    const store = {
        folder: () => options.folder ?? "Lab",
        all: jest.fn(async () => (options.slow ? options.slow : (options.thoughts ?? []))),
        write: jest.fn(async (text: string, o: any) => ({ id: `t${++n}`, at: 1, text, links: [], ...o }) as Thought),
    };
    const judgements = { record: jest.fn((entry: any) => ({ at: 1, ...entry })) };
    const moves = { record: jest.fn((entry: any) => entry) };
    const addSource = jest.fn(async (_path: string, _entries: readonly string[]) => true);
    const view: VaultMovesView & { [k: string]: any } = {
        app: {} as never,
        openAlongside: jest.fn(() => ({ host: host as never, opened: options.opened ?? false })),
        nearFor: jest.fn((text: string) =>
            nearAvailable ? { model, reading: { book: BOOK, bookTitle: "T", chapterKey: CHAPTER, source: true }, ruledOut: new Set<string>(), ruledOutGap: () => false, near: nearPassage(model, buildVocabulary(model), { text, book: BOOK }) } : null
        ),
        fromReadingBox: jest.fn(() => ({ left: 0, top: 900, width: 200, height: 20 })),
        addFromReading: jest.fn(),
        ruleOut: jest.fn(),
        tension: jest.fn(),
    };
    const controller = new ReaderVaultMoves(view, { store, judgements, moves, addSource, sourcesOf: (path) => ((options.cites ?? []).includes(path) ? [`[[${BOOK}#${CHAPTER}|T]] · 2 · The outside view · “‹${QUOTE.exact}›”`] : []) });
    const cards = () => host.byClass("reader-proposal");
    const titles = () => host.byClass("reader-proposal-title").map((el) => el.textContent);
    const button = (card: DomNode, label: string) => {
        const found = card.find((el) => el.tag === "button" && el.textContent === label);
        if (!found) throw new Error(`no "${label}" button`);
        return found;
    };
    return { host, controller, store, judgements, moves, addSource, view, cards, titles, button, setNear: (on: boolean) => (nearAvailable = on) };
}

beforeEach(() => {
    installBrowserGlobals();
});
afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

describe("the Think row (#756 FR-1)", () => {
    function chapter(): FakeEl {
        return new FakeEl("div", [new FakeEl("p", ["This is the planning fallacy, or the planning bias as some call it."]), new FakeEl("p", ["Replay rebuilds it."])]);
    }
    function mount(initial: Thought[] = [], withLocator = true) {
        const body = chapter();
        const host = new DomNode();
        let selection: SelectionInfo | null = null;
        const run = jest.fn();
        const moves: ThinkMove[] = [
            { id: "contradict", label: "reader_move_contradict", run },
            { id: "connect", label: "reader_move_connect", run },
        ];
        const store = {
            folder: () => "Lab",
            highlightsAbout: jest.fn(async () => initial),
            write: jest.fn(),
            save: jest.fn(),
            discard: jest.fn(),
            restore: jest.fn(),
        };
        const highlights = new ReaderHighlights(
            { app: {} as never, host: host as never, owner: new Component(), scrollTo: jest.fn(), onChange: jest.fn(), thinkMoves: () => moves },
            {
                store: store as unknown as HighlightStore,
                selection: () => selection,
                headingAt: () => undefined,
                makeMark: (id) => {
                    const mark = new FakeEl("mark");
                    mark.attrs["data-hl"] = id;
                    return mark as never;
                },
            }
        );
        const attach = () => highlights.attach(body as never, BOOK, new Component(), new DomNode() as never, withLocator ? { at: 1, label: "2 · The outside view", chapter: CHAPTER } : null);
        const select = (words: string) => {
            const start = chapterText(body as never).indexOf(words);
            selection = { start, end: start + words.length, rect: { left: 10, top: 20, width: 30 }, clear: jest.fn() };
        };
        const row = () => host.byClass("reader-hl-think")[0];
        return { highlights, host, body, attach, select, row, run };
    }

    it("offers Contradict and Connect under the meanings of a selection in a book", async () => {
        const m = mount();
        await m.attach();
        m.select("planning fallacy");
        m.body.fire("mouseup");
        const row = m.row();
        expect(row.getAttribute("aria-label")).toBe("Think");
        expect(row.findAll((el) => el.tag === "button").map((b) => b.textContent)).toEqual(["Contradict", "Connect"]);
        row.findAll((el) => el.tag === "button")[0].click();
        expect(m.highlights.hasPopover()).toBe(false);
        const [passage, from] = m.run.mock.calls[0] as [any, any];
        expect(passage.quote.exact).toBe("planning fallacy");
        expect(passage.locator).toEqual({ at: 1, label: "2 · The outside view", chapter: CHAPTER });
        expect(passage.highlight).toBeUndefined();
        expect(from).toEqual(expect.objectContaining({ left: expect.any(Number), top: expect.any(Number) }));
    });

    it("offers the same row on a highlight's popover, carrying the highlight", async () => {
        const marked = { id: "h1", at: 1, text: "", links: [], about: BOOK, quote: { exact: "Replay rebuilds it", prefix: "", suffix: "" }, locator: { at: 1, label: "2 · The outside view", chapter: CHAPTER } } as Thought;
        const m = mount([marked]);
        await m.attach();
        m.body.all("mark")[0].fire("click");
        m.row().findAll((el) => el.tag === "button")[1].click();
        expect((m.run.mock.calls[0][0] as any).highlight.id).toBe("h1");
    });

    it("is not offered in a note reading: a passage of a note is not a source", async () => {
        const m = mount([], false);
        await m.attach();
        m.select("planning fallacy");
        m.body.fire("mouseup");
        expect(m.row()).toBeUndefined();
    });

    it("never draws a move's answer as a mark: it carries its passage, and is not a highlight", async () => {
        const answer = { id: "t1", at: 1, text: "Learning in delivery", links: [], about: BOOK, alsoAbout: "Notes/Ship early.md", quote: { exact: "Replay rebuilds it", prefix: "", suffix: "" }, locator: { at: 1, label: "x", chapter: CHAPTER }, madeBy: { move: "contradict" } } as Thought;
        const m = mount([answer]);
        await m.attach();
        expect(m.body.all("mark")).toHaveLength(0);
    });

    it("ticks the highlight an accepted tension answers (FR-17)", async () => {
        const marked = { id: "h1", at: 1, text: "", links: [], about: BOOK, quote: { exact: "Replay rebuilds it", prefix: "", suffix: "" }, locator: { at: 1, label: "x", chapter: CHAPTER } } as Thought;
        const m = mount([marked]);
        await m.attach();
        m.highlights.markTension("h1");
        expect(m.body.all("mark").every((mark: any) => mark.hasClass("zettelkasten-flow__reader-highlight--tension"))).toBe(true);
    });
});

describe("the answer: a card at the top of Alongside (#756 FR-4, FR-10)", () => {
    it("says what was asked, where the answer came from, the passage, and each candidate with why", async () => {
        const h = harness();
        await h.controller.run("contradict", passage(), FROM);
        const group = h.host.oneByClass("reader-proposal-group");
        expect(group.oneByClass("reader-proposal-group-header").textContent).toBe("Proposed. Nothing is written until you decide.");
        expect(group.oneByClass("reader-proposal-group-origin").textContent).toBe("Contradict · from your vault");
        expect(group.oneByClass("reader-proposal-group-passage").textContent).toBe(QUOTE.exact);
        expect(h.titles()).toEqual(["Ship early"]);
        expect(h.cards()[0].oneByClass("reader-proposal-intro").textContent).toBe("Ship early contradicts Planning fallacy, which this passage names.");
        expect(h.cards()[0].findAll((el) => el.tag === "button").map((b) => b.textContent)).toEqual(["Accept", "Modify", "Reject"]);
        expect(h.controller.hasCards()).toBe(true);
    });

    it("answers Connect with the near idea and the one that supports it, each with why", async () => {
        const h = harness();
        await h.controller.run("connect", passage(), FROM);
        expect(h.titles()).toEqual(["Planning fallacy", "Reference-class forecasting"]);
        expect(h.cards().map((card) => card.oneByClass("reader-proposal-intro").textContent)).toEqual(["Named in this passage", "Supports Planning fallacy"]);
        expect(h.host.oneByClass("reader-proposal-group-origin").textContent).toBe("Connect · from your vault");
    });

    it("says so when nothing stands against the passage, offers nothing to accept, and goes in one click (AC-8)", async () => {
        for (const move of ["contradict", "connect"] as const) {
            const h = harness();
            await h.controller.run(move, passage({ quote: { exact: "Nothing of yours here at all", prefix: "", suffix: "" } }), FROM);
            const line = h.host.oneByClass("reader-proposal-group-line");
            expect(line.textContent).toBe(move === "contradict" ? "Nothing in your vault stands against this passage yet." : "Nothing in your vault is close to this passage yet.");
            expect(h.cards()).toHaveLength(0);
            h.host.find((el) => el.tag === "button" && el.textContent === "Dismiss")!.click();
            expect(h.host.byClass("reader-proposal-group")).toHaveLength(0);
            expect(h.judgements.record).not.toHaveBeenCalled();
        }
    });

    it("leaves out a note that already cites this passage, and one already in a tension with it", async () => {
        const tension = { id: "x", at: 1, text: "", links: [], about: BOOK, alsoAbout: "Notes/Ship early.md", quote: QUOTE, locator: { at: 1, label: "2 · The outside view", chapter: CHAPTER }, madeBy: { move: "contradict" } } as Thought;
        const h = harness({ thoughts: [tension], cites: ["Notes/Planning fallacy.md"] });
        await h.controller.run("contradict", passage(), FROM);
        expect(h.titles()).toEqual([]);
        await h.controller.run("connect", passage(), FROM);
        expect(h.titles()).toEqual(["Reference-class forecasting"]);
    });

    it("needs a thinking space to keep a tension, and says so", async () => {
        const h = harness({ folder: "" });
        await h.controller.run("contradict", passage(), FROM);
        expect(h.host.oneByClass("reader-proposal-group-line").textContent).toContain("thinking");
        expect(h.cards()).toHaveLength(0);
    });

    it("waits without a waiting room: Looking in your vault… only after 150 ms, as text (FR-16)", async () => {
        jest.useFakeTimers();
        let release!: (thoughts: Thought[]) => void;
        const slow = new Promise<Thought[]>((resolve) => (release = resolve));
        const h = harness({ slow });
        const running = h.controller.run("contradict", passage(), FROM);
        jest.advanceTimersByTime(LOOKING_MS - 50);
        expect(h.host.byClass("reader-proposal-group")).toHaveLength(0);
        jest.advanceTimersByTime(100);
        expect(h.host.oneByClass("reader-proposal-group-line").textContent).toBe("Looking in your vault…");
        expect(h.host.findAll((el) => /spin|loader/.test(el.className))).toHaveLength(0);
        release([]);
        await running;
        expect(h.host.oneByClass("reader-proposal-group-line").hasClass("zettelkasten-flow__reader-hidden")).toBe(true);
        expect(h.titles()).toEqual(["Ship early"]);
    });
});

describe("the verdicts, and what each writes (#756 FR-5 to FR-9)", () => {
    it("Contradict, accepted: one tension thought, one judgement with no text, one counterexample move (AC-3)", async () => {
        const highlight = { id: "h1", at: 1, text: "", links: [], about: BOOK, quote: QUOTE } as Thought;
        const h = harness();
        await h.controller.run("contradict", passage({ highlight }), FROM);
        h.button(h.cards()[0], "Accept").click();
        await flush();
        expect(h.store.write).toHaveBeenCalledTimes(1);
        expect(h.store.write).toHaveBeenCalledWith("Ship early contradicts Planning fallacy, which this passage names.", {
            about: BOOK,
            alsoAbout: "Notes/Ship early.md",
            quote: QUOTE,
            locator: { at: 1, label: "2 · The outside view", chapter: CHAPTER },
            respondsTo: { to: "h1", as: "challenge" },
            madeBy: { move: "contradict" },
        });
        expect(h.judgements.record).toHaveBeenCalledTimes(1);
        expect(h.judgements.record).toHaveBeenCalledWith({ path: "Notes/Ship early.md", subject: `reader-contradict:${BOOK}#${CHAPTER}`, origin: "derived", verdict: "accepted" });
        expect(h.moves.record).toHaveBeenCalledWith({ primitive: "perturb", verb: "counterexample", subject: "t1" });
        expect(h.view.addFromReading).toHaveBeenCalledWith({ kind: "tension", path: "Notes/Ship early.md", title: "Ship early" });
        expect(h.view.tension).toHaveBeenCalledWith("h1");
        expect(h.addSource).not.toHaveBeenCalled();
        // Every candidate decided: the card is gone.
        expect(h.host.byClass("reader-proposal-group")).toHaveLength(0);
    });

    it("Contradict, modified: the line editable in place, Keep my version writes your words (AC-4)", async () => {
        const h = harness();
        await h.controller.run("contradict", passage(), FROM);
        const card = h.cards()[0];
        h.button(card, "Modify").click();
        const field = card.find((el) => el.tag === "textarea") as any;
        expect(field.value).toBe("Ship early contradicts Planning fallacy, which this passage names.");
        field.value = "Learning in delivery versus on paper";
        h.button(card, "Keep my version").click();
        await flush();
        expect(h.store.write.mock.calls[0][0]).toBe("Learning in delivery versus on paper");
        expect(h.judgements.record).toHaveBeenCalledWith(expect.objectContaining({ verdict: "modified" }));
        expect(h.moves.record).toHaveBeenCalledWith({ primitive: "perturb", verb: "counterexample", subject: "t1" });
    });

    it("Connect, accepted: the idea gains the passage as one source entry — no thought, one analogy move (AC-5)", async () => {
        const h = harness();
        await h.controller.run("connect", passage(), FROM);
        h.button(h.cards()[1], "Accept").click();
        await flush();
        expect(h.addSource).toHaveBeenCalledTimes(1);
        const [path, entries] = h.addSource.mock.calls[0];
        expect(path).toBe("Notes/Reference-class forecasting.md");
        expect(entries).toHaveLength(1);
        const place = readSourceEntry(entries[0]);
        expect(place && samePlace(place, placeOfPassage(passage()))).toBe(true);
        expect(entries[0]).toContain("2 · The outside view");
        expect(h.store.write).not.toHaveBeenCalled();
        expect(h.judgements.record).toHaveBeenCalledWith({ path: "Notes/Reference-class forecasting.md", subject: `reader-connect:${BOOK}#${CHAPTER}`, origin: "derived", verdict: "accepted" });
        expect(h.moves.record).toHaveBeenCalledWith({ primitive: "explore", verb: "analogy", subject: "Notes/Reference-class forecasting.md" });
    });

    it("Connect, modified: another idea picked in place, and that idea is the one linked (FR-7)", async () => {
        const h = harness();
        await h.controller.run("connect", passage(), FROM);
        const card = h.cards()[0];
        h.button(card, "Modify").click();
        const input = card.oneByClass("reader-idea-picker-input") as any;
        input.value = "optim";
        input.fire("input");
        const rows = card.byClass("reader-idea-picker-row");
        expect(rows.map((r) => r.textContent)).toEqual(["Optimism bias"]);
        input.fire("keydown", { key: "Enter", preventDefault: () => undefined, stopPropagation: () => undefined });
        await flush();
        expect(h.addSource.mock.calls[0][0]).toBe("Notes/Optimism bias.md");
        expect(h.judgements.record).toHaveBeenCalledWith(expect.objectContaining({ path: "Notes/Optimism bias.md", verdict: "modified" }));
    });

    it("Reject: Not related for this chapter, the same verdict as Alongside's — nothing written, no move (AC-6)", async () => {
        const h = harness();
        await h.controller.run("contradict", passage(), FROM);
        h.button(h.cards()[0], "Reject").click();
        await flush();
        expect(h.judgements.record).toHaveBeenCalledTimes(1);
        expect(h.judgements.record).toHaveBeenCalledWith(chapterVerdict("Notes/Ship early.md", BOOK, CHAPTER));
        expect(h.view.ruleOut).toHaveBeenCalledWith(BOOK, CHAPTER, "Notes/Ship early.md");
        expect(h.store.write).not.toHaveBeenCalled();
        expect(h.addSource).not.toHaveBeenCalled();
        expect(h.moves.record).not.toHaveBeenCalled();
    });

    it("Dismiss: Esc, the close, or the Reader closing record nothing and write nothing (AC-7)", async () => {
        const h = harness();
        await h.controller.run("contradict", passage(), FROM);
        h.host.oneByClass("reader-proposal-group").fire("keydown", { key: "Escape", preventDefault: () => undefined, stopPropagation: () => undefined });
        await flush();
        await h.controller.run("connect", passage(), FROM);
        h.host.oneByClass("reader-proposal-group-close").click();
        await flush();
        await h.controller.run("connect", passage(), FROM);
        await h.controller.run("contradict", passage(), FROM);
        expect(h.controller.hasCards()).toBe(true);
        h.controller.dismissNewest();
        expect(h.host.oneByClass("reader-proposal-group-origin").textContent).toBe("Connect · from your vault");
        h.controller.dispose();
        await flush();
        expect(h.host.byClass("reader-proposal-group")).toHaveLength(0);
        expect(h.judgements.record).not.toHaveBeenCalled();
        expect(h.moves.record).not.toHaveBeenCalled();
        expect(h.store.write).not.toHaveBeenCalled();
        expect(h.addSource).not.toHaveBeenCalled();
    });

    it("outlives the selection and the page: Accept still writes the passage it was asked about (FR-11)", async () => {
        const h = harness();
        await h.controller.run("contradict", passage(), FROM);
        h.setNear(false); // the page turned: nothing of the old chapter is on screen
        h.button(h.cards()[0], "Accept").click();
        await flush();
        expect(h.store.write.mock.calls[0][1]).toEqual(expect.objectContaining({ quote: QUOTE, locator: expect.objectContaining({ chapter: CHAPTER }) }));
    });

    it("logs only verbs of the eleven, each with the primitive it belongs to, and the log reads them back (AC-12)", async () => {
        const h = harness();
        await h.controller.run("contradict", passage(), FROM);
        h.button(h.cards()[0], "Accept").click();
        await flush();
        await h.controller.run("connect", passage(), FROM);
        h.button(h.cards()[0], "Accept").click();
        await flush();
        const logged = h.moves.record.mock.calls.map((call) => call[0] as any);
        for (const move of logged) expect(MOVE_VERBS.find((v) => v.verb === move.verb)?.primitive).toBe(move.primitive);
        const back = sanitizeMoveLog(logged.map((move, i) => ({ id: `m${i}`, at: i + 1, ...move })));
        expect(back.map((m) => `${m.primitive}·${m.verb}`)).toEqual(["perturb·counterexample", "explore·analogy"]);
        expect(MOVE_VERBS).toHaveLength(11);
    });
});

describe("no AI, ever (#756 FR-13, AC-9)", () => {
    it("neither the moves nor their answers import the AI layer", () => {
        const root = join(__dirname, "../../../../../src");
        for (const file of ["architecture/components/core/reader/readerVaultMoves.ts", "architecture/knowledge/alongside/vaultMoves.ts"]) {
            expect({ file, ai: /from\s+["']architecture\/ai/.test(readFileSync(join(root, file), "utf8")) }).toEqual({ file, ai: false });
        }
    });

    it("answers both moves with the AI service never asked", async () => {
        const spy = jest.spyOn(AiService, "getInstance");
        const h = harness();
        await h.controller.run("contradict", passage(), FROM);
        await h.controller.run("connect", passage(), FROM);
        expect(h.titles()).toEqual(["Ship early", "Planning fallacy", "Reference-class forecasting"]);
        expect(spy).not.toHaveBeenCalled();
    });
});

describe("motion and feel (#756 FR-15 to FR-19, AC-10)", () => {
    let anims: AnimationRecord;
    let undoMotion: () => void;
    beforeEach(() => {
        anims = recordAnimations();
        undoMotion = reducedMotion(false);
    });
    afterEach(() => {
        anims.stop();
        undoMotion();
    });

    it("flies the answer out of the button onto its place: one flight, the base beat, transform and opacity", async () => {
        const h = harness();
        await h.controller.run("contradict", passage(), FROM);
        const group = h.host.oneByClass("reader-proposal-group");
        const flights = anims.animations.filter((a) => a.target === group);
        expect(flights).toHaveLength(1);
        expect(flights[0].options.duration).toBe(MOTION.base);
        expect(flights[0].options.easing).toBe(MOTION.ease);
        expect([...new Set(flights[0].keyframes.flatMap((f) => Object.keys(f)))].sort()).toEqual(["opacity", "transform"]);
        expect(flights[0].keyframes[0].transform).toMatch(/^translate\(/);
        // Input during the flight jumps it to its end.
        group.fire("pointerdown");
        expect(flights[0].playState).toBe("finished");
    });

    it("rides Alongside in when it was closed: the card is already in its place, no second flight", async () => {
        const h = harness({ opened: true });
        await h.controller.run("contradict", passage(), FROM);
        const group = h.host.oneByClass("reader-proposal-group");
        expect(anims.animations.filter((a) => a.target === group)).toHaveLength(0);
    });

    it("slides a rejected candidate 16 px away and fades it, at the fast beat, never by height", async () => {
        const h = harness();
        await h.controller.run("connect", passage(), FROM);
        const card = h.cards()[0];
        h.button(card, "Reject").click();
        const leave = anims.animations.find((a) => a.target === card)!;
        expect(leave.options.duration).toBe(MOTION.fast);
        expect(leave.keyframes[1]).toEqual({ transform: "translate(16px, 0px)", opacity: 0 });
        expect(anims.keys().has("height")).toBe(false);
        anims.finishAll();
        await flush();
        expect(h.cards()).toHaveLength(1);
    });

    it("folds an accepted candidate into From this reading", async () => {
        const h = harness();
        await h.controller.run("contradict", passage(), FROM);
        const card = h.cards()[0];
        h.button(card, "Accept").click();
        const fold = anims.animations.find((a) => a.target === card)!;
        expect(fold.options.duration).toBe(MOTION.base);
        expect(String(fold.keyframes[2].transform)).toMatch(/^translate\(/);
        expect(h.view.fromReadingBox).toHaveBeenCalled();
    });

    it("is all instant under reduced motion", async () => {
        undoMotion();
        undoMotion = reducedMotion(true);
        const h = harness();
        await h.controller.run("contradict", passage(), FROM);
        h.button(h.cards()[0], "Reject").click();
        await flush();
        expect(anims.animations).toHaveLength(0);
        expect(h.judgements.record).toHaveBeenCalledTimes(1);
    });
});

describe("one Esc step for every card (#748, #756)", () => {
    it("dismisses the newest card of all its owners, whoever opened it", async () => {
        const { dismissNewestOf, nextProposalSeq } = await import("architecture/components/core/reader/readerProposal");
        const older = { hasCards: () => true, newestSeq: () => nextProposalSeq(), dismissNewest: jest.fn() };
        const seq = nextProposalSeq();
        const newer = { hasCards: () => true, newestSeq: () => seq + 100, dismissNewest: jest.fn() };
        const empty = { hasCards: () => false, newestSeq: () => 0, dismissNewest: jest.fn() };
        expect(dismissNewestOf([older, null, newer, empty])).toBe(true);
        expect(newer.dismissNewest).toHaveBeenCalledTimes(1);
        expect(older.dismissNewest).not.toHaveBeenCalled();
        expect(dismissNewestOf([empty, undefined])).toBe(false);
    });

    it("the ReaderView's proposal step asks the ink's reading and the moves alike", () => {
        const src = readFileSync(join(__dirname, "../../../../../src/architecture/components/core/reader/ReaderView.ts"), "utf8");
        expect(src).toContain("dismissNewestOf([this.ink?.reading, this.vaultMoves, this.aiMoves, this.claimLink])");
        expect(src).toContain("this.ink?.reading.hasCards() || this.vaultMoves?.hasCards()");
    });
});

describe("the idea picker (#756 FR-7)", () => {
    it("lists the near ideas before you type, moves with the arrows, and Esc goes back to the choice", async () => {
        const h = harness();
        await h.controller.run("connect", passage(), FROM);
        const card = h.cards()[0];
        h.button(card, "Modify").click();
        const rows = () => card.byClass("reader-idea-picker-row");
        expect(rows().map((r) => r.textContent)).toEqual(["Planning fallacy"]);
        const input = card.oneByClass("reader-idea-picker-input") as any;
        input.value = "o";
        input.fire("input");
        expect(rows().map((r) => r.textContent)).toEqual(["Optimism bias", "Reference-class forecasting"]);
        const key = (k: string) => input.fire("keydown", { key: k, preventDefault: () => undefined, stopPropagation: () => undefined });
        key("ArrowDown");
        expect(rows()[1].hasClass("is-selected")).toBe(true);
        key("Escape");
        expect(card.byClass("reader-idea-picker")).toHaveLength(0);
        expect(card.oneByClass("reader-proposal-actions").hasClass("zettelkasten-flow__reader-hidden")).toBe(false);
        expect(h.judgements.record).not.toHaveBeenCalled();
    });
});
