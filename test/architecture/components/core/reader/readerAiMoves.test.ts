/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { Component } from "obsidian";
import { DomNode, flush, installBrowserGlobals } from "../../../../support/dashboardDom";
import { FakeEl } from "../../../../support/textDom";
import { recordAnimations, reducedMotion, type AnimationRecord } from "../../../../support/motionDom";
import { ReaderAiMoves, STILL_WAITING_MS, aiThinkMoves, answerText, type AiMovePassage, type AiMovesView, type ReaderAi } from "architecture/components/core/reader/readerAiMoves";
import { ReaderHighlights, type HighlightStore, type SelectionInfo } from "architecture/components/core/reader/readerHighlights";
import { MOTION } from "architecture/components/core/reader/readerMotion";
import { chapterText, paragraphsAround } from "architecture/components/core/reader/readerMarks";
import { madeByLabel } from "architecture/components/core/lab/LabRenderer";
import { readerAiMove } from "application/thinking/readerMovePrompts";
import { MOVE_VERBS, sanitizeMoveLog } from "application/thinking/move";
import type { AiGateState } from "architecture/ai/aiGate";
import type { Thought, ThoughtQuote } from "application/thinking/thought";

/**
 * **Thinking moves by your AI provider** (#759). The provider is faked with promises a test settles
 * by hand, so what is on the card before, during and after the answer can be looked at.
 */

const BOOK = "Books/Thinking, Fast and Slow.epub";
const CHAPTER = "OEBPS/text/ch23.xhtml";
const QUOTE: ThoughtQuote = { exact: "This is the planning fallacy", prefix: "cases. ", suffix: ", or the planning bias" };
const passage = (over: Partial<AiMovePassage> = {}): AiMovePassage => ({
    book: BOOK,
    bookTitle: "Thinking, Fast and Slow",
    quote: QUOTE,
    locator: { at: 22, label: "23 · The outside view", chapter: CHAPTER },
    paragraph: "This is the planning fallacy, or the planning bias as some call it.",
    previous: "Forecasts were too optimistic in every case.",
    ...over,
});
const FROM = { left: 100, top: 400, width: 80, height: 24 };

function deferred() {
    let resolve!: (text: string) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<string>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function harness(options: { gate?: AiGateState; opened?: boolean; folder?: string } = {}) {
    const host = new DomNode();
    let gate: AiGateState = options.gate ?? "ready";
    const requests: { prompt: string; d: ReturnType<typeof deferred> }[] = [];
    const complete = jest.fn((prompt: string) => {
        const d = deferred();
        requests.push({ prompt, d });
        return d.promise;
    });
    const getProvider = jest.fn(() => ({ complete }));
    const ai: ReaderAi = { gate: () => gate, config: () => ({ enabled: true, endpoint: "http://127.0.0.1:1/v1", apiKey: "x", model: "m" }), getProvider };
    let n = 0;
    const store = {
        folder: () => options.folder ?? "Lab",
        write: jest.fn(async (text: string, o: any) => ({ id: `t${++n}`, at: 1, text, links: [], ...o }) as Thought),
    };
    const judgements = { record: jest.fn((entry: any) => ({ at: 1, ...entry })) };
    const moves = { record: jest.fn((entry: any) => entry) };
    const openSettings = jest.fn();
    const view: AiMovesView & { [k: string]: any } = {
        app: {} as never,
        openAlongside: jest.fn(() => ({ host: host as never, opened: options.opened ?? false })),
        fromReadingBox: jest.fn(() => ({ left: 0, top: 900, width: 200, height: 20 })),
        addFromReading: jest.fn(),
        dot: jest.fn(),
        language: () => "es",
    };
    const controller = new ReaderAiMoves(view, { ai, store, judgements, moves, openSettings });
    const cards = () => host.byClass("reader-proposal");
    const button = (card: DomNode, label: string) => {
        const found = card.find((el) => el.tag === "button" && el.textContent === label && !el.parent?.hasClass("zettelkasten-flow__reader-hidden"));
        if (!found) throw new Error(`no "${label}" button`);
        return found;
    };
    const visibleButtons = (card: DomNode) =>
        card.findAll((el) => el.tag === "button" && !el.parent?.hasClass("zettelkasten-flow__reader-hidden")).map((el) => el.textContent);
    return { host, controller, complete, getProvider, requests, store, judgements, moves, openSettings, view, cards, button, visibleButtons, setGate: (g: AiGateState) => (gate = g) };
}

beforeEach(() => {
    installBrowserGlobals();
});
afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

describe("the gate, honestly (#759 FR-2, FR-3, AC-2)", () => {
    it("offers nothing while AI is off: the Think row keeps Contradict and Connect only", () => {
        expect(aiThinkMoves("disabled", () => () => undefined)).toEqual([]);
    });

    it("offers the six after them when AI is on, set up or not", () => {
        for (const gate of ["unconfigured", "ready"] as const) {
            expect(aiThinkMoves(gate, () => () => undefined).map((m) => [m.id, m.label])).toEqual([
                ["why", "reader_move_why"],
                ["challenge", "reader_move_challenge"],
                ["question", "reader_move_question"],
                ["claim", "reader_move_claim"],
                ["reflect", "reader_move_reflect"],
                ["explain", "reader_move_explain"],
            ]);
        }
    });

    it("reads the gate each time the row is drawn, and never throws without the plugin's settings", () => {
        const h = harness({ gate: "disabled" });
        expect(h.controller.thinkMoves(() => () => undefined)).toEqual([]);
        h.setGate("ready");
        expect(h.controller.thinkMoves(() => () => undefined)).toHaveLength(6);
        const lonely = new ReaderAiMoves(h.view, {
            ai: {
                gate: () => {
                    throw new Error("no plugin");
                },
            } as never,
        });
        expect(lonely.thinkMoves(() => () => undefined)).toEqual([]);
    });

    it("not set up: a click shows the set-up card, points to Settings › AI, and never calls the provider", () => {
        const h = harness({ gate: "unconfigured" });
        h.controller.run("why", passage(), FROM);
        const card = h.cards()[0];
        expect(card.oneByClass("reader-proposal-answer").textContent).toBe("Your AI provider isn't set up yet");
        h.button(card, "Open AI settings").click();
        expect(h.openSettings).toHaveBeenCalledTimes(1);
        expect(h.getProvider).not.toHaveBeenCalled();
        expect(h.complete).not.toHaveBeenCalled();
    });

    it("ready: one click, exactly one request", async () => {
        const h = harness();
        h.controller.run("why", passage(), FROM);
        await flush();
        expect(h.complete).toHaveBeenCalledTimes(1);
    });

    it("sends only the passage, its two paragraphs and the two titles, asked in your language (FR-4)", async () => {
        const h = harness();
        h.controller.run("challenge", passage(), FROM);
        await flush();
        const prompt = h.requests[0].prompt;
        expect(prompt.startsWith(readerAiMove("challenge").task)).toBe(true);
        expect(prompt).toContain("Answer in Spanish, in at most 2 sentences");
        expect(prompt).toContain("Book: Thinking, Fast and Slow\nChapter: 23 · The outside view\nPrevious paragraph: Forecasts were too optimistic in every case.\nParagraph: This is the planning fallacy, or the planning bias as some call it.\nSelected: This is the planning fallacy");
        expect(prompt).not.toContain(BOOK);
    });

    it("needs a thinking space to keep an answer, and spends no request without one", async () => {
        const h = harness({ folder: "" });
        h.controller.run("why", passage(), FROM);
        await flush();
        expect(h.cards()[0].oneByClass("reader-proposal-answer").textContent).toBe("Set a thinking space folder in Settings › Thinking to keep highlights.");
        expect(h.complete).not.toHaveBeenCalled();
    });
});

describe("nothing fires on its own (#759 FR-2, AC-7)", () => {
    function mount(gate: AiGateState) {
        const body = new FakeEl("div", [new FakeEl("p", ["Forecasts were too optimistic."]), new FakeEl("p", ["This is the planning fallacy, or the planning bias as some call it."])]);
        const host = new DomNode();
        let selection: SelectionInfo | null = null;
        const h = harness({ gate });
        const highlights = new ReaderHighlights(
            { app: {} as never, host: host as never, owner: new Component(), scrollTo: jest.fn(), onChange: jest.fn(), thinkMoves: () => h.controller.thinkMoves((id) => (p, from) => h.controller.run(id, { ...p, book: BOOK, bookTitle: "T", ...paragraphsAround(body as never, p.quote) }, from)) },
            {
                store: { folder: () => "Lab", highlightsAbout: jest.fn(async () => []), write: jest.fn(), save: jest.fn(), discard: jest.fn(), restore: jest.fn() } as unknown as HighlightStore,
                selection: () => selection,
                headingAt: () => undefined,
                makeMark: () => new FakeEl("mark") as never,
            }
        );
        const select = (words: string) => {
            const start = chapterText(body as never).indexOf(words);
            selection = { start, end: start + words.length, rect: { left: 10, top: 20, width: 30 }, clear: jest.fn() };
        };
        return { h, body, host, highlights, select, attach: () => highlights.attach(body as never, BOOK, new Component(), new DomNode() as never, { at: 22, label: "23 · The outside view", chapter: CHAPTER }) };
    }

    it("selecting, the row appearing and Alongside opening send nothing; the click sends one", async () => {
        const m = mount("ready");
        await m.attach();
        m.select("planning fallacy");
        m.body.fire("mouseup");
        const row = m.host.byClass("reader-hl-think")[0];
        expect(row.findAll((el) => el.tag === "button").map((b) => b.textContent)).toEqual(["Why?", "Challenge", "Question", "What's the claim", "Reflect", "Explain"]);
        m.h.controller.attach(new DomNode() as never);
        await flush();
        expect(m.h.complete).not.toHaveBeenCalled();
        row.findAll((el) => el.tag === "button")[0].click();
        await flush();
        expect(m.h.complete).toHaveBeenCalledTimes(1);
        // The paragraph it sits in, and the one before — read from the chapter.
        expect(m.h.requests[0].prompt).toContain("Previous paragraph: Forecasts were too optimistic.\nParagraph: This is the planning fallacy, or the planning bias as some call it.\nSelected: planning fallacy");
    });

    it("draws no AI move while AI is off", async () => {
        const m = mount("disabled");
        await m.attach();
        m.select("planning fallacy");
        m.body.fire("mouseup");
        expect(m.host.byClass("reader-hl-think")).toHaveLength(0);
    });
});

describe("the card: at once, waiting like a pen, landing in place (#759 FR-6, FR-12 to FR-14, AC-8)", () => {
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

    it("is there before the provider answers: the move, where it comes from, the passage, three ink lines and Cancel", () => {
        const h = harness();
        h.controller.run("why", passage(), FROM);
        const card = h.cards()[0];
        expect(card.oneByClass("reader-proposal-title").textContent).toBe("Why?");
        expect(card.oneByClass("reader-proposal-byline").textContent).toBe("Proposed by your AI provider");
        expect(card.oneByClass("reader-proposal-passage").textContent).toBe("This is the planning fallacy");
        expect(card.byClass("reader-ink-wait")[0].children.filter((el) => el.tag === "span")).toHaveLength(3);
        expect(card.find((el) => el.tag === "progress" || /spinner|loading/.test(el.className))).toBeUndefined();
        expect(h.visibleButtons(card)).toEqual(["Cancel"]);
    });

    it("flies from the button: one flight, the base beat, transform and opacity (FR-12)", () => {
        const h = harness();
        h.controller.run("why", passage(), FROM);
        const card = h.cards()[0];
        const flights = anims.animations.filter((a) => a.target === card);
        expect(flights).toHaveLength(1);
        expect(flights[0].options.duration).toBe(MOTION.base);
        expect([...new Set(flights[0].keyframes.flatMap((f) => Object.keys(f)))].sort()).toEqual(["opacity", "transform"]);
    });

    it("rides Alongside in when it opens now: no second flight", () => {
        const h = harness({ opened: true });
        h.controller.run("why", passage(), FROM);
        expect(anims.animations.filter((a) => a.target === h.cards()[0])).toHaveLength(0);
    });

    it("adds a quiet Still waiting… after 8 s, and nothing before (FR-13)", async () => {
        jest.useFakeTimers();
        const h = harness();
        h.controller.run("why", passage(), FROM);
        await Promise.resolve();
        await Promise.resolve();
        const note = h.cards()[0].oneByClass("reader-proposal-note");
        jest.advanceTimersByTime(STILL_WAITING_MS - 1);
        expect(note.hasClass("zettelkasten-flow__reader-hidden")).toBe(true);
        jest.advanceTimersByTime(1);
        expect(note.textContent).toBe("Still waiting for your provider…");
        expect(note.hasClass("zettelkasten-flow__reader-hidden")).toBe(false);
    });

    it("lands in the same box: the ink fades out, the words fade in, opacity only, the fast beat (FR-14)", async () => {
        const h = harness();
        h.controller.run("why", passage(), FROM);
        await flush();
        const card = h.cards()[0];
        const box = card.oneByClass("reader-proposal-answer");
        const ink = box.oneByClass("reader-ink-wait");
        anims.animations.length = 0;
        h.requests[0].d.resolve("## Why\nBecause forecasts ignore base rates. They anchor on the case. A third. A fourth. A fifth.");
        await flush();
        expect(card.oneByClass("reader-proposal-answer")).toBe(box);
        expect(box.oneByClass("reader-proposal-answer-text").textContent).toBe("Because forecasts ignore base rates. They anchor on the case. A third. A fourth.");
        const fades = anims.animations.filter((a) => a.target === ink || a.target.hasClass?.("zettelkasten-flow__reader-proposal-answer-text"));
        expect(fades).toHaveLength(2);
        for (const fade of fades) {
            expect(fade.options.duration).toBe(MOTION.fast);
            expect([...new Set(fade.keyframes.flatMap((f) => Object.keys(f)))]).toEqual(["opacity"]);
        }
        anims.finishAll();
        expect(box.byClass("reader-ink-wait")).toHaveLength(0);
        expect(h.visibleButtons(card)).toEqual(["Accept", "Modify", "Reject"]);
        expect(h.view.dot).not.toHaveBeenCalledWith(true);
    });

    it("lights a dot on Alongside's button when it lands while Alongside is closed, and opening clears it (FR-14)", async () => {
        const h = harness();
        h.controller.run("why", passage(), FROM);
        await flush();
        h.controller.detach();
        expect(h.controller.hasCards()).toBe(false);
        h.requests[0].d.resolve("Because.");
        await flush();
        expect(h.view.dot).toHaveBeenLastCalledWith(true);
        const panel = new DomNode();
        h.controller.attach(panel as never);
        expect(h.view.dot).toHaveBeenLastCalledWith(false);
        expect(panel.byClass("reader-proposal")).toHaveLength(1);
        expect(h.controller.hasCards()).toBe(true);
        const src = readFileSync(join(__dirname, "../../../../../src/architecture/components/core/reader/readerAiMoves.ts"), "utf8");
        expect(src).not.toMatch(/new Notice\(/);
    });

    it("is all instant under reduced motion (FR-16)", async () => {
        undoMotion();
        undoMotion = reducedMotion(true);
        const h = harness();
        h.controller.run("why", passage(), FROM);
        await flush();
        h.requests[0].d.resolve("Because.");
        await flush();
        h.button(h.cards()[0], "Accept").click();
        await flush();
        expect(anims.animations).toHaveLength(0);
        expect(h.store.write).toHaveBeenCalledTimes(1);
    });

    it("folds an accepted answer into From this reading (FR-15)", async () => {
        const h = harness();
        h.controller.run("why", passage(), FROM);
        await flush();
        h.requests[0].d.resolve("Because.");
        await flush();
        const card = h.cards()[0];
        h.button(card, "Accept").click();
        const fold = anims.animations.find((a) => a.target === card && a.options.fill === "forwards")!;
        expect(fold.options.duration).toBe(MOTION.base);
        expect(h.view.fromReadingBox).toHaveBeenCalled();
    });
});

describe("the verdicts, and what each writes (#759 FR-7, FR-8, AC-4, AC-5)", () => {
    async function landed(move: Parameters<ReaderAiMoves["run"]>[0] = "why", over: Partial<AiMovePassage> = {}, answer = "Because forecasts ignore base rates.") {
        const h = harness();
        h.controller.run(move, passage(over), FROM);
        await flush();
        h.requests[0].d.resolve(answer);
        await flush();
        return h;
    }

    it("Accept: one thought quoting the passage, made by Why? and AI; one judgement with no text; one reframe move", async () => {
        const h = await landed();
        h.button(h.cards()[0], "Accept").click();
        await flush();
        expect(h.store.write).toHaveBeenCalledTimes(1);
        const [text, o] = h.store.write.mock.calls[0] as [string, any];
        expect(text).toBe("Because forecasts ignore base rates.");
        expect(o).toEqual({ about: BOOK, quote: QUOTE, locator: passage().locator, madeBy: { move: "why", ai: true } });
        expect(h.judgements.record).toHaveBeenCalledTimes(1);
        const judgement = h.judgements.record.mock.calls[0][0] as any;
        expect(judgement).toEqual({ path: BOOK, subject: "reader-ai:why", origin: "ai", verdict: "accepted" });
        expect(JSON.stringify(judgement)).not.toContain("base rates");
        expect(h.moves.record).toHaveBeenCalledWith({ primitive: "transform", verb: "reframe", subject: "t1" });
        expect(h.view.addFromReading).toHaveBeenCalledWith({ kind: "thought", path: expect.stringMatching(/^Lab\//), title: "Why?" });
    });

    it("Modify: the answer editable where it was, Keep my version writes your words and records modified", async () => {
        const h = await landed();
        const card = h.cards()[0];
        h.button(card, "Modify").click();
        const field = card.find((el) => el.tag === "textarea") as any;
        expect(field.value).toBe("Because forecasts ignore base rates.");
        field.value = "Because forecasts ignore the base rates of similar projects.";
        h.button(card, "Keep my version").click();
        await flush();
        expect(h.store.write.mock.calls[0][0]).toBe("Because forecasts ignore the base rates of similar projects.");
        expect((h.judgements.record.mock.calls[0][0] as any).verdict).toBe("modified");
        expect(h.moves.record).toHaveBeenCalledTimes(1);
    });

    it("threads under a highlight: Challenge as a challenge, the others as forks", async () => {
        const highlight = { id: "h1", at: 1, text: "", links: [], about: BOOK, quote: QUOTE } as Thought;
        const challenge = await landed("challenge", { highlight });
        h_accept(challenge);
        await flush();
        expect((challenge.store.write.mock.calls[0][1] as any).respondsTo).toEqual({ to: "h1", as: "challenge" });
        expect(challenge.moves.record).toHaveBeenCalledWith({ primitive: "perturb", verb: "challenge", subject: "t1" });
        const why = await landed("why", { highlight });
        h_accept(why);
        await flush();
        expect((why.store.write.mock.calls[0][1] as any).respondsTo).toEqual({ to: "h1", as: "fork" });
    });

    function h_accept(h: ReturnType<typeof harness>) {
        h.button(h.cards()[0], "Accept").click();
    }

    it("What's the claim: the claim and its kind on the card, and in the thought; a compress move", async () => {
        const h = await landed("claim", {}, "Claim: Plans ignore the base rate.\nKind: causal");
        expect(h.cards()[0].oneByClass("reader-proposal-answer-text").textContent).toBe("Plans ignore the base rate.\nKind: causal");
        h_accept(h);
        await flush();
        expect(h.store.write.mock.calls[0][0]).toBe("Plans ignore the base rate.\nKind: causal");
        expect(h.moves.record).toHaveBeenCalledWith({ primitive: "transform", verb: "compress", subject: "t1" });
    });

    it("What's the claim, accepted: Claim beside its row opens the claim sheet with that thought (#762 FR-1)", async () => {
        const h = await landed("claim", {}, "Claim: Plans ignore the base rate.\nKind: causal");
        const claim = jest.fn();
        h.view.claim = claim;
        h_accept(h);
        await flush();
        const entry = (h.view.addFromReading as jest.Mock).mock.calls[0][0] as any;
        expect(entry).toEqual(expect.objectContaining({ kind: "thought", title: "What's the claim" }));
        entry.claim(FROM);
        expect(claim).toHaveBeenCalledWith(expect.objectContaining({ id: "t1", madeBy: { move: "claim", ai: true } }), FROM);
        // Only What's the claim: the other moves' rows carry no Claim.
        const why = await landed("why");
        why.view.claim = jest.fn();
        h_accept(why);
        await flush();
        expect(((why.view.addFromReading as jest.Mock).mock.calls[0][0] as any).claim).toBeUndefined();
    });

    it("Reject: nothing written, no move, one rejected verdict", async () => {
        const h = await landed("question");
        h.button(h.cards()[0], "Reject").click();
        await flush();
        expect(h.store.write).not.toHaveBeenCalled();
        expect(h.moves.record).not.toHaveBeenCalled();
        expect(h.judgements.record.mock.calls.map((c) => c[0])).toEqual([{ path: BOOK, subject: "reader-ai:question", origin: "ai", verdict: "rejected" }]);
    });

    it("Dismiss, Cancel and the Reader closing while it waits record nothing; a late answer shows nothing", async () => {
        const h = harness();
        h.controller.run("explain", passage(), FROM);
        await flush();
        h.button(h.cards()[0], "Cancel").click();
        await flush();
        expect(h.cards()).toHaveLength(0);
        h.requests[0].d.resolve("Late.");
        await flush();
        expect(h.cards()).toHaveLength(0);

        h.controller.run("why", passage(), FROM);
        await flush();
        expect(h.controller.hasCards()).toBe(true);
        h.controller.dismissNewest();
        await flush();
        h.requests[1].d.resolve("Late.");

        h.controller.run("reflect", passage(), FROM);
        await flush();
        h.controller.dispose();
        h.requests[2].d.resolve("Late.");
        await flush();
        expect(h.cards()).toHaveLength(0);
        expect(h.store.write).not.toHaveBeenCalled();
        expect(h.judgements.record).not.toHaveBeenCalled();
        expect(h.moves.record).not.toHaveBeenCalled();
    });
});

describe("latency, cost and failure (#759 FR-9, AC-6)", () => {
    it("ignores a double click: one card, one request", async () => {
        const h = harness();
        h.controller.run("why", passage(), FROM);
        h.controller.run("why", passage(), FROM);
        await flush();
        expect(h.cards()).toHaveLength(1);
        expect(h.complete).toHaveBeenCalledTimes(1);
    });

    it("says the provider did not answer after its time-out, with Try again — and never retries by itself", async () => {
        const h = harness();
        h.controller.run("reflect", passage(), FROM);
        await flush();
        h.requests[0].d.reject(new Error("AI request timed out after 30000ms"));
        await flush();
        const card = h.cards()[0];
        expect(card.oneByClass("reader-proposal-answer").textContent).toBe("Your AI provider didn't answer.");
        expect(h.visibleButtons(card)).toEqual(["Try again", "Dismiss"]);
        await flush();
        expect(h.complete).toHaveBeenCalledTimes(1);
        h.button(card, "Try again").click();
        await flush();
        expect(h.complete).toHaveBeenCalledTimes(2);
        expect(card.byClass("reader-ink-wait")).toHaveLength(1);
        h.requests[1].d.resolve("If so, plans fail. Do yours?");
        await flush();
        expect(card.oneByClass("reader-proposal-answer-text").textContent).toBe("If so, plans fail. Do yours?");
    });

    it("shows a provider's status: The provider answered 429", async () => {
        const h = harness();
        h.controller.run("why", passage(), FROM);
        await flush();
        h.requests[0].d.reject(new Error("AI request failed with status 429"));
        await flush();
        expect(h.cards()[0].oneByClass("reader-proposal-answer").textContent).toBe("The provider answered 429");
        h.requests.length = 0;
    });

    it("sends two at once; the third says it waits, and goes when one lands", async () => {
        const h = harness();
        h.controller.run("why", passage(), FROM);
        h.controller.run("challenge", passage(), FROM);
        h.controller.run("question", passage(), FROM);
        await flush();
        expect(h.complete).toHaveBeenCalledTimes(2);
        const third = h.cards()[2];
        expect(third.oneByClass("reader-proposal-note").textContent).toBe("Waiting for the one before it…");
        h.requests[0].d.resolve("Because.");
        await flush();
        expect(h.complete).toHaveBeenCalledTimes(3);
        expect(third.oneByClass("reader-proposal-note").hasClass("zettelkasten-flow__reader-hidden")).toBe(true);
    });
});

describe("the same vocabulary, and the same Esc (#759 AC-10, #756)", () => {
    it("logs only verbs of the eleven, each under its own primitive, and the log reads them back", async () => {
        const logged: any[] = [];
        for (const id of ["why", "challenge", "question", "claim", "reflect", "explain"] as const) {
            const h = harness();
            h.controller.run(id, passage(), FROM);
            await flush();
            h.requests[0].d.resolve(id === "claim" ? "Claim: x.\nKind: general" : "An answer.");
            await flush();
            h.button(h.cards()[0], "Accept").click();
            await flush();
            logged.push(...h.moves.record.mock.calls.map((c) => c[0]));
        }
        const byVerb = new Map(MOVE_VERBS.map((v) => [v.verb, v.primitive]));
        expect(logged.map((m) => m.verb)).toEqual(["reframe", "challenge", "branch", "compress", "branch", "reframe"]);
        for (const move of logged) expect(byVerb.get(move.verb)).toBe(move.primitive);
        const back = sanitizeMoveLog(logged.map((m, i) => ({ id: `m${i}`, at: i + 1, ...m })));
        expect(back).toHaveLength(6);
        expect(MOVE_VERBS).toHaveLength(11);
    });

    it("joins the Reader's one proposal step: Esc takes the newest card of all its owners", () => {
        const src = readFileSync(join(__dirname, "../../../../../src/architecture/components/core/reader/ReaderView.ts"), "utf8");
        expect(src).toContain("dismissNewestOf([this.ink?.reading, this.vaultMoves, this.aiMoves, this.claimLink, this.lookup])");
        expect(src).toContain("this.aiMoves?.hasCards()");
    });

    it("reads the answer as the card shows it", () => {
        expect(answerText(readerAiMove("question"), "1. What would change it? And more?")).toBe("What would change it?");
        expect(answerText(readerAiMove("claim"), "Claim: Plans fail.\nKind: odd")).toBe("Plans fail.");
    });
});

describe("Think says where an answer came from (#759 FR-7)", () => {
    it("chips an AI move's thought Why? · AI, and a vault move's as before", () => {
        expect(madeByLabel({ move: "why", ai: true })).toBe("Why? · AI");
        expect(madeByLabel({ move: "claim", ai: true })).toBe("What's the claim · AI");
        expect(madeByLabel({ move: "contradict" })).toBe("Contradict");
        expect(madeByLabel(undefined)).toBeNull();
    });
});

describe("the paragraph and the one before (#759 FR-4)", () => {
    it("finds the passage's block and its previous one; across blocks, every block it touches", () => {
        const body = new FakeEl("div", [new FakeEl("h2", ["The outside view"]), new FakeEl("p", ["First paragraph."]), new FakeEl("p", ["Second ", new FakeEl("em", ["paragraph"]), " here."]), new FakeEl("p", ["Third."])]);
        expect(paragraphsAround(body as never, { exact: "paragraph here" })).toEqual({ paragraph: "Second paragraph here.", previous: "First paragraph." });
        expect(paragraphsAround(body as never, { exact: "here.Third" })).toEqual({ paragraph: "Second paragraph here. Third.", previous: "First paragraph." });
        expect(paragraphsAround(body as never, { exact: "First" })).toEqual({ paragraph: "First paragraph.", previous: "The outside view" });
        expect(paragraphsAround(body as never, { exact: "absent", prefix: "a ", suffix: " b" })).toEqual({ paragraph: "a absent b", previous: "" });
    });
});

describe("the popover holds eight moves (#759 T7, #750)", () => {
    it("wraps the Think row inside the popover, on the 4-grid", () => {
        const css = readFileSync(join(__dirname, "../../../../../src/styles/components/reader.scss"), "utf8");
        const at = css.indexOf(".zettelkasten-flow__reader-hl-think {");
        const rule = css.slice(at, css.indexOf("}", at));
        expect(rule).toContain("flex-wrap: wrap;");
        expect(rule).toContain("gap: var(--size-4-1);");
    });
});

describe("a hidden row of the card is gone on screen (#759, found in the walk)", () => {
    it("hides a card's row with reader-hidden over the row's own display", () => {
        const css = readFileSync(join(__dirname, "../../../../../src/styles/components/reader.scss"), "utf8");
        expect(css).toMatch(/\.zettelkasten-flow__reader-proposal > \.zettelkasten-flow__reader-hidden \{\s*display: none;/);
    });
});
