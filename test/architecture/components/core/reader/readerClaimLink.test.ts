/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { Component } from "obsidian";
import { DomNode, flush, installBrowserGlobals } from "../../../../support/dashboardDom";
import { FakeEl } from "../../../../support/textDom";
import { recordAnimations, reducedMotion, type AnimationRecord } from "../../../../support/motionDom";
import { ReaderHighlights, type HighlightStore, type PassageActions, type SelectionInfo } from "architecture/components/core/reader/readerHighlights";
import { ReaderClaimLink, SHEET_SLIDE_PX, type ClaimLinkView, type CreateOutcome } from "architecture/components/core/reader/readerClaimLink";
import type { VaultMovePassage } from "architecture/components/core/reader/readerVaultMoves";
import { MOTION } from "architecture/components/core/reader/readerMotion";
import { chapterText } from "architecture/components/core/reader/readerMarks";
import { parseReaderState } from "architecture/components/core/reader/readerContract";
import { buildVocabulary, nearPassage } from "architecture/knowledge/state";
import { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import type { Idea } from "architecture/knowledge/model/Idea";
import { readSourceEntry, samePlace } from "application/library/provenance";
import { AiService } from "architecture/ai/AiService";
import type { Thought, ThoughtQuote } from "application/thinking/thought";

/**
 * **Make it a claim, link it to an idea** (#762). The sheet, the picker and their writes, mounted on
 * the small DOM: the create, the property write and the record are spies, so what is written — and
 * what is not — can be counted.
 */

const BOOK = "Books/Thinking, Fast and Slow.epub";
const CHAPTER = "OEBPS/text/ch23.xhtml";
const QUOTE: ThoughtQuote = { exact: "This is the planning fallacy, or the planning bias", prefix: "cases. ", suffix: " as some call it" };
const FROM = { left: 120, top: 300, width: 200, height: 22 };

function note(path: string, title: string): Idea {
    return { path, title, created: 0, modified: 0, state: "permanent", relations: [], claims: [], maturitySignals: { inDegree: 0, outDegree: 0, degree: 0, hasSources: false } };
}

function vault(empty = false): KnowledgeModel {
    const model = new KnowledgeModel();
    // The excluded folder's note is never in the model (#529): scope keeps it out of the index.
    model.build(empty ? [] : [note("Notes/Planning fallacy.md", "Planning fallacy"), note("Notes/Optimism bias.md", "Optimism bias"), note("Notes/Ship early.md", "Ship early")]);
    return model;
}

const passage = (over: Partial<VaultMovePassage> = {}): VaultMovePassage => ({
    book: BOOK,
    bookTitle: "Thinking, Fast and Slow",
    quote: QUOTE,
    locator: { at: 22, label: "23 · The outside view", chapter: CHAPTER, page: "249" },
    ...over,
});

function harness(options: { opened?: boolean; taken?: string[]; outcome?: CreateOutcome; cites?: string[]; empty?: boolean; sheet?: boolean } = {}) {
    const host = new DomNode();
    const panel = host.createDiv({ cls: ["zettelkasten-flow__reader-panel", ...(options.sheet ? ["zettelkasten-flow__reader-panel--sheet"] : [])] });
    const from = host.createDiv({ cls: "zettelkasten-flow__reader-from-reading" });
    const model = vault(options.empty);
    const entries: any[] = [];
    const view: ClaimLinkView & { [k: string]: any } = {
        app: {} as never,
        host: () => host as never,
        openAlongside: jest.fn(() => ({ panel: panel as never, opened: options.opened ?? false })),
        closeAlongside: jest.fn(),
        nearFor: jest.fn((text: string) => ({ model, reading: { book: BOOK, bookTitle: "T", chapterKey: CHAPTER, source: true }, ruledOut: new Set<string>(), ruledOutGap: () => false, near: nearPassage(model, buildVocabulary(model), { text, book: BOOK }) })),
        fromReadingBox: jest.fn(() => ({ left: 900, top: 700, width: 240, height: 20 })),
        addFromReading: jest.fn((entry: any) => {
            entries.push(entry);
            from.createEl("button", { cls: "zettelkasten-flow__reader-from-reading-row", text: entry.title });
        }),
        claimed: jest.fn(),
        unclaimed: jest.fn(),
        peek: jest.fn(),
    };
    const createNote = jest.fn(async (_path: string, _content: string): Promise<CreateOutcome> => options.outcome ?? "created");
    const addSource = jest.fn(async (_path: string, _entries: readonly string[]) => true);
    const judgements = { record: jest.fn((entry: any) => entry) };
    const undo = jest.fn(async (_batch: string) => true);
    const cites = new Set(options.cites ?? []);
    const controller = new ReaderClaimLink(view, {
        existing: (path) => ((options.taken ?? []).includes(path) ? path : null),
        createNote,
        addSource,
        sourcesOf: (path) => (cites.has(path) ? [`[[${BOOK}#${CHAPTER}|T]] p. 249 · 23 · The outside view · “‹${QUOTE.exact}›”`] : []),
        judgements,
        folderSuggest: () => undefined,
        undo,
    });
    const sheet = () => panel.byClass("reader-claim-sheet")[0];
    const button = (root: DomNode, label: string) => {
        const found = root.find((el) => el.tag === "button" && el.textContent === label);
        if (!found) throw new Error(`no "${label}" button`);
        return found;
    };
    return { host, panel, from, view, controller, createNote, addSource, judgements, sheet, button, entries, cites, undo };
}

let motion: AnimationRecord | null = null;
let undoReduced: (() => void) | null = null;

beforeEach(() => {
    installBrowserGlobals();
});
afterEach(() => {
    motion?.stop();
    motion = null;
    undoReduced?.();
    undoReduced = null;
    jest.useRealTimers();
    jest.restoreAllMocks();
});

describe("two buttons in the popover's first row (#762 FR-1)", () => {
    function chapter(): FakeEl {
        return new FakeEl("div", [new FakeEl("p", ["This is the planning fallacy, or the planning bias as some call it."]), new FakeEl("p", ["Replay rebuilds it."])]);
    }
    function mount(initial: Thought[] = [], withLocator = true, gestures: PassageActions | null = { claim: jest.fn(), link: jest.fn() }) {
        const body = chapter();
        const host = new DomNode();
        const margin = new DomNode();
        let selection: SelectionInfo | null = null;
        const store = {
            folder: () => "Lab",
            highlightsAbout: jest.fn(async () => initial),
            write: jest.fn(),
            save: jest.fn(async (_t: Thought) => undefined),
            discard: jest.fn(),
            restore: jest.fn(),
        };
        const highlights = new ReaderHighlights(
            { app: {} as never, host: host as never, owner: new Component(), scrollTo: jest.fn(), onChange: jest.fn(), thinkMoves: () => [], passageActions: () => gestures },
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
        const attach = () => highlights.attach(body as never, BOOK, new Component(), margin as never, withLocator ? { at: 22, label: "23 · The outside view", chapter: CHAPTER } : null);
        const select = (words: string) => {
            const start = chapterText(body as never).indexOf(words);
            selection = { start, end: start + words.length, rect: { left: 10, top: 20, width: 30, height: 18 }, clear: jest.fn() };
        };
        const actions = () => host.byClass("reader-hl-actions")[0];
        return { highlights, host, body, margin, attach, select, actions, store, gestures };
    }

    it("puts Claim and Link to an idea right after Highlight and note, for a selection in a book", async () => {
        const m = mount();
        await m.attach();
        m.select("planning fallacy");
        m.body.fire("mouseup");
        const labels = m.actions().findAll((el) => el.tag === "button").map((b) => b.textContent);
        expect(labels.slice(0, 3)).toEqual(["Highlight and note", "Claim", "Link to an idea"]);
        m.actions().find((el) => el.textContent === "Claim")!.click();
        expect(m.highlights.hasPopover()).toBe(false);
        const [given, from] = (m.gestures!.claim as jest.Mock).mock.calls[0] as [any, any];
        expect(given.quote.exact).toBe("planning fallacy");
        expect(given.locator.chapter).toBe(CHAPTER);
        expect(from).toEqual({ left: 10, top: 20, width: 30, height: 18 });
    });

    it("offers the same two on a highlight's popover, carrying the highlight", async () => {
        const marked = { id: "h1", at: 1, text: "", links: [], about: BOOK, quote: { exact: "Replay rebuilds it", prefix: "", suffix: "" }, locator: { at: 22, label: "23", chapter: CHAPTER } } as Thought;
        const m = mount([marked]);
        await m.attach();
        m.body.all("mark")[0].fire("click");
        m.actions().find((el) => el.textContent === "Claim")!.click();
        expect(((m.gestures!.claim as jest.Mock).mock.calls[0][0] as any).highlight.id).toBe("h1");
    });

    it("turns the popover into the picker for Link to an idea, growing from the button", async () => {
        const m = mount();
        await m.attach();
        m.select("planning fallacy");
        m.body.fire("mouseup");
        m.actions().find((el) => el.textContent === "Link to an idea")!.click();
        const [given, container, from, close] = (m.gestures!.link as jest.Mock).mock.calls[0] as [any, DomNode, any, () => void];
        expect(given.quote.exact).toBe("planning fallacy");
        expect(container.hasClass("zettelkasten-flow__reader-hl-pop--picker")).toBe(true);
        expect(from).toEqual({ left: 0, top: 0, width: 100, height: 100 });
        close();
        expect(m.highlights.hasPopover()).toBe(false);
    });

    it("is not offered in a note reading, nor where the view gives no gestures", async () => {
        const note = mount([], false);
        await note.attach();
        note.select("planning fallacy");
        note.body.fire("mouseup");
        expect(note.actions().findAll((el) => el.textContent === "Claim")).toHaveLength(0);
        const none = mount([], true, null);
        await none.attach();
        none.select("planning fallacy");
        none.body.fire("mouseup");
        expect(none.actions().findAll((el) => el.textContent === "Link to an idea")).toHaveLength(0);
    });

    it("keeps the highlight a claim was made from: never set aside, its row says Claim, its marks ticked (FR-5, AC-3)", async () => {
        const marked = { id: "h1", at: 1, text: "", links: [], about: BOOK, quote: { exact: "Replay rebuilds it", prefix: "", suffix: "" }, locator: { at: 22, label: "23", chapter: CHAPTER } } as Thought;
        const m = mount([marked]);
        await m.attach();
        await m.highlights.markClaimed("h1", "Claims/Replay rebuilds it.md");
        expect(m.store.save).toHaveBeenCalledTimes(1);
        const saved = m.store.save.mock.calls[0][0] as Thought;
        expect(saved.claims).toEqual(["Claims/Replay rebuilds it.md"]);
        expect(saved.incubated).toBeUndefined();
        expect(m.margin.byClass("reader-hl-claim").map((el) => el.textContent)).toEqual(["Claim: Replay rebuilds it"]);
        expect(m.body.all("mark").every((mark: any) => mark.hasClass("zettelkasten-flow__reader-highlight--claim"))).toBe(true);
        // The tick on its first mark only (found in review: :first-of-type reads the tag, not the class).
        expect(m.body.all("mark").map((mark: any) => mark.hasClass("zettelkasten-flow__reader-highlight--claim-start"))).toEqual([true]);
        await m.highlights.markClaimed("h1", "Claims/Replay rebuilds it.md", false);
        expect(m.body.all("mark").some((mark: any) => mark.hasClass("zettelkasten-flow__reader-highlight--claim"))).toBe(false);
    });

    it("draws a claimed highlight with its tick already there, never fading in again", async () => {
        const marked = { id: "h1", at: 1, text: "", links: [], about: BOOK, quote: { exact: "Replay rebuilds it", prefix: "", suffix: "" }, locator: { at: 22, label: "23", chapter: CHAPTER }, claims: ["Claims/X.md"] } as Thought;
        const m = mount([marked]);
        await m.attach();
        const mark = m.body.all("mark")[0] as any;
        expect(mark.hasClass("zettelkasten-flow__reader-highlight--claim")).toBe(true);
        expect(mark.hasClass("zettelkasten-flow__reader-highlight--claim-kept")).toBe(true);
    });
});

describe("the sheet beside the page (#762 FR-2, FR-12)", () => {
    it("opens in Alongside's slot with the claim, the title following it, the passage, the source and the folder", () => {
        const h = harness();
        h.controller.claim(passage(), FROM);
        const sheet = h.sheet();
        expect(h.panel.hasClass("zettelkasten-flow__reader-panel--claiming")).toBe(true);
        expect(sheet.getAttribute("role")).toBe("dialog");
        const area = sheet.find((el) => el.tag === "textarea") as DomNode;
        expect(area.value).toBe(QUOTE.exact);
        expect(area.getAttribute("placeholder")).toBe("One sentence you would defend");
        const title = sheet.oneByClass("reader-claim-title");
        expect(title.value).toBe(QUOTE.exact);
        area.value = "Plans ignore the base rate.";
        area.fire("input");
        expect(title.value).toBe("Plans ignore the base rate");
        // Your own title stops it following.
        title.value = "Base rates";
        title.fire("input");
        area.value = "Plans ignore base rates.";
        area.fire("input");
        expect(title.value).toBe("Base rates");
        expect(sheet.oneByClass("reader-claim-quote").textContent).toBe(QUOTE.exact);
        const source = sheet.oneByClass("reader-claim-source").textContent;
        expect(readSourceEntry(source)).toEqual(expect.objectContaining({ file: BOOK, chapter: CHAPTER, page: "249", title: "Thinking, Fast and Slow" }));
        expect(sheet.oneByClass("reader-claim-folder").getAttribute("placeholder")).toBe("The vault's root");
        expect(h.createNote).not.toHaveBeenCalled();
    });

    it("prefills an accepted What's the claim: its sentence, never its kind (FR-2)", () => {
        const h = harness();
        h.controller.claim(passage(), FROM, { accepted: { text: "Plans ignore the base rate.\nKind: causal" } });
        expect((h.sheet().find((el) => el.tag === "textarea") as DomNode).value).toBe("Plans ignore the base rate.");
    });

    it("has no Create while the claim is blank (FR-4, AC-2)", () => {
        const h = harness();
        h.controller.claim(passage(), FROM);
        const area = h.sheet().find((el) => el.tag === "textarea") as DomNode;
        area.value = "   ";
        area.fire("input");
        const create = h.button(h.sheet(), "Create");
        expect(create.disabled).toBe(true);
        create.click();
        expect(h.createNote).not.toHaveBeenCalled();
    });

    it("slides in like Alongside while the words travel into its quote: one gesture, one beat, compositor only", () => {
        motion = recordAnimations();
        const h = harness();
        h.controller.claim(passage(), FROM);
        const slide = motion.animations.find((a) => a.target === h.sheet());
        const ghost = motion.animations.find((a) => (a.target as DomNode).hasClass?.("zettelkasten-flow__reader-claim-ghost"));
        expect(slide?.options.duration).toBe(MOTION.base);
        expect(ghost?.options.duration).toBe(MOTION.base);
        expect(slide?.keyframes[0]).toEqual({ transform: `translate(${SHEET_SLIDE_PX}px, 0px)`, opacity: 0 });
        expect((ghost?.target as DomNode).textContent).toBe(QUOTE.exact);
        expect([...motion.keys()].every((key) => ["transform", "opacity", "offset"].includes(key))).toBe(true);
    });

    it("rides Alongside in when it opens now, and rises from below as the iPad's sheet", () => {
        motion = recordAnimations();
        const opened = harness({ opened: true });
        opened.controller.claim(passage(), FROM);
        expect(motion.animations.filter((a) => a.target === opened.sheet())).toHaveLength(0);
        const sheet = harness({ sheet: true });
        sheet.controller.claim(passage(), FROM);
        const rise = motion.animations.find((a) => a.target === sheet.sheet());
        expect(rise?.keyframes[0]).toEqual({ transform: `translate(0px, ${SHEET_SLIDE_PX}px)`, opacity: 0 });
    });

    it("is instant under reduced motion, and the same sheet (FR-15)", () => {
        motion = recordAnimations();
        undoReduced = reducedMotion(true);
        const h = harness();
        h.controller.claim(passage(), FROM);
        expect(motion.animations).toHaveLength(0);
        expect(h.sheet()).toBeDefined();
        h.button(h.sheet(), "Cancel").click();
        expect(motion.animations).toHaveLength(0);
        expect(h.sheet()).toBeUndefined();
    });

    it("jumps a move to its end on input (FR-15)", () => {
        motion = recordAnimations();
        const h = harness();
        h.controller.claim(passage(), FROM);
        const slide = motion.animations.find((a) => a.target === h.sheet());
        h.sheet().fire("keydown", { key: "a" });
        expect(slide?.playState).toBe("finished");
    });

    it("goes back into the panel when it is drawn again, and with it when it closes — nothing written", () => {
        const h = harness();
        h.controller.claim(passage(), FROM);
        const sheet = h.sheet();
        h.panel.empty();
        h.controller.attach(h.panel as never);
        expect(h.sheet()).toBe(sheet);
        h.controller.drop();
        expect(h.sheet()).toBeUndefined();
        expect(h.panel.hasClass("zettelkasten-flow__reader-panel--claiming")).toBe(false);
        expect(h.createNote).not.toHaveBeenCalled();
    });
});

describe("Create: one note, create-only (#762 FR-3, FR-4, FR-13, AC-2)", () => {
    function create(h: ReturnType<typeof harness>, claim = "Plans ignore the base rate.", folder = "") {
        // The folder the last claim went to is kept for the session: each test says its own.
        (h.sheet().oneByClass("reader-claim-folder") as DomNode).value = folder;
        const area = h.sheet().find((el) => el.tag === "textarea") as DomNode;
        area.value = claim;
        area.fire("input");
        h.button(h.sheet(), "Create").click();
    }

    it("creates exactly one note through the seam, records one human verdict, and no move", async () => {
        const h = harness();
        h.controller.claim(passage(), FROM);
        create(h, undefined, "/Claims/");
        await flush();
        expect(h.createNote).toHaveBeenCalledTimes(1);
        const [path, content] = h.createNote.mock.calls[0] as [string, string];
        expect(path).toBe("Claims/Plans ignore the base rate.md");
        expect(content.split("\n").slice(0, 3)).toEqual(["---", 'claim: "Plans ignore the base rate."', "source:"]);
        expect(content).toContain(`> ${QUOTE.exact}`);
        expect(h.judgements.record).toHaveBeenCalledTimes(1);
        expect(h.judgements.record).toHaveBeenCalledWith({ path, subject: "reader-claim", origin: "human", verdict: "accepted" });
        expect(h.entries).toEqual([{ kind: "claim", path, title: "Plans ignore the base rate", undo: expect.any(Function) }]);
        expect(h.sheet()).toBeUndefined();
        expect(h.panel.hasClass("zettelkasten-flow__reader-panel--claiming")).toBe(false);
    });

    it("keeps a highlight and points it at its claim — never set aside (FR-5)", async () => {
        const highlight = { id: "h1", at: 1, text: "", links: [], about: BOOK, quote: QUOTE } as Thought;
        const h = harness();
        h.controller.claim(passage({ highlight }), FROM);
        create(h);
        await flush();
        expect(h.view.claimed).toHaveBeenCalledWith("h1", "Plans ignore the base rate.md");
        // Undo from its row takes back the one batch, and the highlight stops pointing at the claim.
        expect(await h.entries[0].undo()).toBe(true);
        expect(h.undo).toHaveBeenCalledWith(expect.any(String));
        expect(h.view.unclaimed).toHaveBeenCalledWith("h1", "Plans ignore the base rate.md");
    });

    it("folds the sheet into its row under From this reading, one transform beat", async () => {
        motion = recordAnimations();
        const h = harness();
        h.controller.claim(passage(), FROM);
        motion.finishAll();
        const sheet = h.sheet();
        create(h);
        await flush();
        const fold = motion.animations.filter((a) => a.target === sheet).pop();
        expect(fold?.options.duration).toBe(MOTION.base);
        expect(fold?.keyframes.map((frame) => Object.keys(frame).sort())).toEqual([
            ["opacity", "transform"],
            ["opacity", "transform"],
        ]);
        expect(String(fold?.keyframes[1].transform)).toMatch(/^translate\(900px, 700px\) scale\(2\.4, 0\.2\)$/);
        fold?.finish();
        expect(sheet.isConnected).toBe(false);
    });

    it("never overwrites a taken name: it says so, offers Open it, and writes nothing (AC-2)", async () => {
        const h = harness({ taken: ["Plans ignore the base rate.md"] });
        h.controller.claim(passage(), FROM);
        create(h);
        await flush();
        expect(h.createNote).not.toHaveBeenCalled();
        const taken = h.sheet().oneByClass("reader-claim-taken");
        expect(taken.hasClass("zettelkasten-flow__reader-hidden")).toBe(false);
        expect(taken.textContent).toContain("A note with this name already exists");
        h.button(taken, "Open it").click();
        expect(h.view.peek).toHaveBeenCalledWith(expect.anything(), "Plans ignore the base rate.md", "Plans ignore the base rate");
        expect(h.judgements.record).not.toHaveBeenCalled();
        expect(h.entries).toEqual([]);
    });

    it("reads a title ending in a full stop as the same name (found in the walk)", async () => {
        const h = harness({ taken: ["Plans ignore the base rate.md"] });
        h.controller.claim(passage(), FROM);
        const title = h.sheet().oneByClass("reader-claim-title") as DomNode;
        title.value = "Plans ignore the base rate.";
        title.fire("input");
        create(h);
        await flush();
        expect(h.createNote).not.toHaveBeenCalled();
        expect(h.sheet().oneByClass("reader-claim-taken").textContent).toContain("A note with this name already exists");
    });

    it("says the name is taken when the disk says so first, and records nothing", async () => {
        const h = harness({ outcome: "taken" });
        h.controller.claim(passage(), FROM);
        create(h);
        await flush();
        expect(h.sheet().oneByClass("reader-claim-taken").textContent).toContain("A note with this name already exists");
        expect(h.judgements.record).not.toHaveBeenCalled();
    });

    it("Cancel slides it back out and the words return to the page; Alongside opened for it goes with it", () => {
        motion = recordAnimations();
        const h = harness();
        h.controller.claim(passage(), FROM);
        motion.finishAll();
        const sheet = h.sheet();
        h.button(sheet, "Cancel").click();
        const out = motion.animations.filter((a) => a.target === sheet).pop();
        expect(out?.keyframes[1]).toEqual({ transform: `translate(${SHEET_SLIDE_PX}px, 0px)`, opacity: 0 });
        const back = motion.animations.filter((a) => (a.target as DomNode).hasClass?.("zettelkasten-flow__reader-claim-ghost")).pop();
        expect(String(back?.keyframes[2].transform)).toMatch(/^translate\(120px, 300px\)/);
        expect(h.view.closeAlongside).not.toHaveBeenCalled();
        const opened = harness({ opened: true });
        opened.controller.claim(passage(), FROM);
        opened.button(opened.sheet(), "Cancel").click();
        expect(opened.view.closeAlongside).toHaveBeenCalledTimes(1);
        expect(opened.createNote).not.toHaveBeenCalled();
    });

    it("goes with Esc like a card, the newest first (#748)", () => {
        const h = harness();
        h.controller.claim(passage(), FROM);
        expect(h.controller.hasCards()).toBe(true);
        expect(h.controller.newestSeq()).toBeGreaterThan(0);
        h.controller.dismissNewest();
        expect(h.controller.hasCards()).toBe(false);
        expect(h.createNote).not.toHaveBeenCalled();
    });
});

describe("Link to an idea, with #756's picker (#762 FR-6 to FR-9, FR-14, AC-4, AC-5)", () => {
    function open(h: ReturnType<typeof harness>, over: Partial<VaultMovePassage> = {}) {
        const container = h.host.createDiv();
        const close = jest.fn();
        const picker = h.controller.link(passage(over), container as never, { left: 40, top: 60, width: 90, height: 24 }, close);
        const rows = () => container.byClass("reader-idea-picker-row").map((el) => el.textContent);
        const type = (text: string) => {
            (picker.input as any).value = text;
            (picker.input as any).fire("input");
        };
        return { container, close, picker, rows, type };
    }

    it("grows from the button: 0.96 → 1 and a fade, fast, its origin at the button", () => {
        motion = recordAnimations();
        const h = harness();
        const p = open(h);
        const grow = motion.animations.find((a) => a.target === p.picker.el);
        expect(grow?.keyframes).toEqual([
            { transform: "scale(0.96)", opacity: 0 },
            { transform: "scale(1)", opacity: 1 },
        ]);
        expect(grow?.options.duration).toBe(MOTION.fast);
        expect((p.picker.el as any).cssProps).toEqual({ "--zf-origin-x": "85px", "--zf-origin-y": "72px" });
    });

    it("lists the notes near the passage first, and searches only the notes in scope", () => {
        const h = harness();
        const p = open(h);
        expect(p.rows()).toEqual(["Planning fallacy"]);
        p.type("bias");
        expect(p.rows()).toEqual(["Optimism bias"]);
        p.type("outside");
        expect(p.rows()).toEqual([]);
    });

    it("is near the paragraph the words are in, not only the words (step 7 of How to verify)", () => {
        const h = harness();
        const container = h.host.createDiv();
        h.controller.link({ ...passage({ quote: { exact: "close to best-case scenarios", prefix: "", suffix: "" } }), paragraph: "This is the planning fallacy: plans close to best-case scenarios." }, container as never, FROM, jest.fn());
        expect(container.byClass("reader-idea-picker-row").map((el) => el.textContent)).toEqual(["Planning fallacy"]);
    });

    it("links: one source entry for the idea, Linked to … under From this reading, the name flying there", async () => {
        motion = recordAnimations();
        const h = harness();
        const p = open(h);
        p.type("optimism");
        p.container.byClass("reader-idea-picker-row")[0].click();
        await flush();
        expect(h.addSource).toHaveBeenCalledTimes(1);
        const [path, written] = h.addSource.mock.calls[0] as [string, string[]];
        expect(path).toBe("Notes/Optimism bias.md");
        expect(written).toHaveLength(1);
        const cited = readSourceEntry(written[0]);
        expect(cited && samePlace(cited, { file: BOOK, chapter: CHAPTER, label: "", quote: QUOTE })).toBe(true);
        expect(h.entries).toEqual([{ kind: "link", path: "Notes/Optimism bias.md", title: "Optimism bias", undo: expect.any(Function) }]);
        await h.entries[0].undo();
        expect(h.undo).toHaveBeenCalledTimes(1);
        const flight = motion.animations.find((a) => (a.target as DomNode).hasClass?.("zettelkasten-flow__reader-claim-ghost"));
        expect((flight?.target as DomNode).textContent).toBe("Optimism bias");
        // The picker closes the way it came, then the popover goes.
        const back = motion.animations.filter((a) => a.target === p.picker.el).pop();
        expect(back?.keyframes[1]).toEqual({ transform: "scale(0.96)", opacity: 0 });
        back?.finish();
        expect(p.close).toHaveBeenCalledTimes(1);
        expect(h.judgements.record).not.toHaveBeenCalled();
    });

    it("says Already linked to this passage, and writes nothing, for an idea that cites it (FR-7)", async () => {
        const h = harness({ cites: ["Notes/Optimism bias.md"] });
        const p = open(h);
        p.type("optimism");
        p.container.byClass("reader-idea-picker-row")[0].click();
        await flush();
        expect(h.addSource).not.toHaveBeenCalled();
        expect(p.container.oneByClass("reader-idea-picker-line").textContent).toBe("Already linked to this passage");
        expect(p.close).not.toHaveBeenCalled();
    });

    it("says so too when the write finds the entry already there", async () => {
        const h = harness();
        h.addSource.mockImplementation(async () => false);
        const p = open(h);
        p.container.byClass("reader-idea-picker-row")[0].click();
        await flush();
        expect(p.container.oneByClass("reader-idea-picker-line").textContent).toBe("Already linked to this passage");
        expect(h.entries).toEqual([]);
    });

    it("has its two empty states, and Make it a claim opens the sheet with the search as the claim (FR-9)", () => {
        const empty = harness({ empty: true });
        const none = open(empty);
        expect(none.container.oneByClass("reader-idea-picker-empty").textContent).toBe("No notes yet. Make it a claim to create the first.");
        const h = harness();
        const p = open(h);
        p.type("anchoring effect");
        expect(p.container.oneByClass("reader-idea-picker-empty").textContent).toBe("No note by that name.");
        h.button(p.container, "Make it a claim").click();
        expect((h.sheet().find((el) => el.tag === "textarea") as DomNode).value).toBe("anchoring effect");
        expect(p.close).toHaveBeenCalledTimes(1);
    });

    it("goes back on Esc, nothing written", () => {
        const h = harness();
        const p = open(h);
        (p.picker.input as any).fire("keydown", { key: "Escape", preventDefault: () => undefined, stopPropagation: () => undefined });
        expect(p.close).toHaveBeenCalledTimes(1);
        expect(h.addSource).not.toHaveBeenCalled();
    });
});

describe("no AI, and the book never written (#762 FR-10, AC-6)", () => {
    const ROOT = join(__dirname, "..", "..", "..", "..", "..");
    const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

    it("imports nothing from the AI layer", () => {
        for (const file of ["src/architecture/components/core/reader/readerClaimLink.ts", "src/application/library/claimFromPassage.ts"]) {
            expect({ file, ai: /from "architecture\/ai/.test(read(file)) }).toEqual({ file, ai: false });
        }
    });

    it("never calls the AI service, and writes only a note and an idea — never the book", async () => {
        const ai = jest.spyOn(AiService, "getInstance");
        const h = harness();
        h.controller.claim(passage(), FROM);
        (h.sheet().oneByClass("reader-claim-folder") as DomNode).value = "";
        h.button(h.sheet(), "Create").click();
        await flush();
        const container = h.host.createDiv();
        const picker = h.controller.link(passage(), container as never, FROM, jest.fn());
        (picker.input as any).value = "optimism";
        (picker.input as any).fire("input");
        container.byClass("reader-idea-picker-row")[0].click();
        await flush();
        expect(ai).not.toHaveBeenCalled();
        const written = [...h.createNote.mock.calls.map((call) => call[0]), ...h.addSource.mock.calls.map((call) => call[0])];
        expect(written).toEqual(["This is the planning fallacy, or the planning bias.md", "Notes/Optimism bias.md"]);
        expect(written.some((path) => /\.(epub|pdf)$/i.test(path))).toBe(false);
    });
});

describe("Think's Claim opens the Reader with the sheet (#762 FR-1)", () => {
    it("carries a one-shot claimFrom in the Reader's state", () => {
        expect(parseReaderState({ source: BOOK, claimFrom: "t1" }).claimFrom).toBe("t1");
        expect(parseReaderState({ source: BOOK, claimFrom: "" }).claimFrom).toBeUndefined();
        expect(parseReaderState({ source: BOOK, claimFrom: 3 }).claimFrom).toBeUndefined();
    });

    it("shows Claim on an accepted What's the claim card in Think, and only there", () => {
        const lab = readFileSync(join(__dirname, "..", "..", "..", "..", "..", "src", "architecture", "components", "core", "lab", "LabRenderer.ts"), "utf8");
        const at = lab.indexOf("private renderAnswered(");
        const body = lab.slice(at, lab.indexOf("\n    }", at));
        expect(body).toContain('thought.madeBy?.move !== "claim"');
        expect(body).toContain("claimFrom: thought.id");
    });
});
