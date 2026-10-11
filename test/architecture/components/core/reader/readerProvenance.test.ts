/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeAll, afterAll, beforeEach, afterEach } from "@jest/globals";
import { TFile, WorkspaceLeaf } from "obsidian";
import { log } from "architecture";
import { DomNode, settle } from "../../../../support/dashboardDom";
import { parseXml } from "../../../../support/miniXml";
import { makeEpub } from "../../../../support/zipFixture";
import { withTextNodes } from "../../../../support/domText";
import { recordAnimations, reducedMotion, type AnimationRecord } from "../../../../support/motionDom";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import { resetReaderWorkspace } from "architecture/components/core/reader/openReader";
import { endChapterTurn } from "architecture/components/core/reader/readerTurn";
import { HERE_MS, HERE_REDUCED_MS } from "architecture/components/core/reader/readerHere";
import { MOTION } from "architecture/components/core/reader/readerMotion";
import { READING_LINE } from "architecture/components/core/reader/readerPlace";
import { openPassageLink } from "architecture/components/core/reader/readerLink";
import { flyOrigin, originLandsAt } from "architecture/components/core/reader/openReader";
import type { HighlightStore } from "architecture/components/core/reader/readerHighlights";
import { passageLink, serializePlace, type PassagePlace } from "application/library/provenance";

const g = globalThis as any;
const PATH = "Books/thinking.epub";
const cls = (name: string) => `zettelkasten-flow__${name}`;

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.name = path.split("/").pop() ?? path;
    f.extension = path.split(".").pop() ?? "";
    (f as any).stat = { size: 10, mtime: 20, ctime: 1 };
    return f;
}

const para = (chapter: number, i: number) => `Chapter ${chapter} paragraph ${i} holds a sentence long enough to be a line of its own.`;
/**
 * Three parts of six paragraphs. Part two declares its print pages twice over — a page-break mark in
 * its text, and a page-list target — so a passage in it is cited on its page.
 */
const BOOK = makeEpub({
    title: "Thinking, Fast and Slow",
    chapters: [1, 2, 3].map((n) => ({
        id: `c${n}`,
        href: `text/ch${n}.xhtml`,
        title: `${n} · Part ${n}`,
        body: Array.from({ length: 6 }, (_, i) => `<p${n === 2 && i === 0 ? ' id="p40"' : ""}>${n === 2 && i === 3 ? '<span epub:type="pagebreak" title="41"/>' : ""}${para(n, i)}</p>`).join(""),
    })),
    pageList: [{ label: "40", href: "text/ch2.xhtml#p40" }],
});

const ROW_PX = 200;
const STAGE = { left: 0, top: 0, width: 1000, height: 700 };

function mount() {
    const book = file(PATH);
    const vault = {
        getAbstractFileByPath: (path: string) => (path === book.path ? book : null),
        readBinary: async () => BOOK.buffer.slice(BOOK.byteOffset, BOOK.byteOffset + BOOK.byteLength),
        cachedRead: async () => "",
        modify: jest.fn(),
        create: jest.fn(),
        process: jest.fn(),
        modifyBinary: jest.fn(),
    };
    const app = {
        workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), iterateAllLeaves: () => undefined, setActiveLeaf: jest.fn(), trigger: jest.fn() },
        vault,
        metadataCache: { getFirstLinkpathDest: () => null, on: () => ({}) },
    };
    const content = new DomNode();
    const leaf = new WorkspaceLeaf(app, content) as unknown as WorkspaceLeaf & { detach: jest.Mock };
    leaf.detach = jest.fn();
    const host = { settings: { readingMotion: { chapter: "stack" } } as Record<string, any>, saveSettings: jest.fn(async () => undefined) };
    const store: HighlightStore = {
        folder: () => "Lab",
        highlightsAbout: jest.fn(async () => []),
        write: jest.fn(async (text: string, options: any) => ({ id: "new", at: 1, text, links: [], ...options })),
        save: jest.fn(async () => undefined),
        discard: jest.fn(async () => undefined),
        restore: jest.fn(async () => undefined),
    };
    const view = new ReaderView(leaf, host, { store });
    return { view, content, host, store, vault, app };
}

/** The stage as a browser would lay it out: 1000 × 700, every block 200 px tall, moved by the scroll. */
function layOut(m: ReturnType<typeof mount>) {
    const stage = m.content.oneByClass("reader-stage") as any;
    stage.clientHeight = STAGE.height;
    const blocks = () => ((m.view as any).pager?.blocks() ?? []) as DomNode[];
    Object.defineProperty(stage, "scrollHeight", { configurable: true, get: () => Math.max(STAGE.height, blocks().length * ROW_PX) });
    const proto = DomNode.prototype as any;
    const plain = proto.getBoundingClientRect;
    proto.getBoundingClientRect = function (this: DomNode) {
        if (this === stage) return { ...STAGE };
        const list = blocks();
        const i = list.findIndex((block) => block === this || block.contains(this));
        if (i >= 0) return { left: 100, top: i * ROW_PX - stage.scrollTop, width: 700, height: ROW_PX };
        return plain.call(this);
    };
    return { stage, restore: () => (proto.getBoundingClientRect = plain) };
}

const livePage = (content: DomNode) => content.byClass("reader-stage")[0]?.children.find((child) => child.hasClass(cls("reader-page")));
const count = (content: DomNode) => livePage(content)?.byClass("reader-count")[0]?.textContent ?? "";
async function drawn(content: DomNode, chapter: number) {
    await settle(() => count(content) === `Chapter ${chapter} / 3` && (livePage(content)?.byClass("reader-next").length ?? 0) > 0);
}
const here = (content: DomNode) => content.byClass("reader-here");
const missing = (content: DomNode) => content.byClass("reader-passage-missing");

const place = (chapter: number, words: string, over: Partial<PassagePlace> = {}): PassagePlace => ({
    file: PATH,
    chapter: `OEBPS/text/ch${chapter}.xhtml`,
    label: `${chapter} · Part ${chapter}`,
    quote: { exact: words, prefix: "", suffix: "" },
    ...over,
});

describe("the Reader lands on a passage a note goes back to (#751 AC-6, AC-7, AC-9)", () => {
    let undoText: () => void;
    let rec: AnimationRecord;
    let motion: () => void;
    let restoreLayout: (() => void) | null = null;
    beforeAll(() => {
        g.DOMParser = class {
            parseFromString(text: string) {
                return { ...parseXml(text), getElementsByTagName: () => [] };
            }
        };
        undoText = withTextNodes();
    });
    afterAll(() => {
        delete g.DOMParser;
        undoText();
    });
    beforeEach(() => {
        g.addEventListener ??= () => undefined;
        g.removeEventListener ??= () => undefined;
        resetReaderWorkspace();
        rec = recordAnimations();
        motion = reducedMotion(false);
    });
    afterEach(() => {
        endChapterTurn();
        restoreLayout?.();
        restoreLayout = null;
        rec.stop();
        motion();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    /** Open the Reader the way *Born from* does: on the source, with the place to land on. */
    async function openAt(at: PassagePlace, chapter = 0) {
        const m = mount();
        await m.view.onOpen();
        const laid = layOut(m);
        restoreLayout = laid.restore;
        await m.view.setState({ source: PATH, chapter, at: serializePlace(at) }, {} as never);
        return { ...m, ...laid };
    }

    it("draws the passage's chapter, puts it at the reading line and marks it — under the words, then gone", async () => {
        jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick", "queueMicrotask"] });
        const m = await openAt(place(2, "Chapter 2 paragraph 4 holds"));
        await drawn(m.content, 2);
        // Block 4 is the passage: its top at the reading line, a third of the stage down.
        expect(m.stage.scrollTop).toBe(4 * ROW_PX - Math.round(STAGE.height * READING_LINE));
        const marks = here(m.content);
        expect(marks.length).toBeGreaterThan(0);
        expect(marks[0].textContent).toMatch(/^Chapter 2 paragraph 4 holds/);
        expect(missing(m.content)).toHaveLength(0);
        // The mark is a class: no scripted animation moves anything but transform and opacity.
        for (const key of rec.keys()) expect(["transform", "opacity", "translate", "scale", "offset", "easing"]).toContain(key);
        jest.advanceTimersByTime(HERE_MS + MOTION.shotPush + 100);
        expect(here(m.content)).toHaveLength(0);
        expect(m.content.oneByClass("reader-source-body").textContent).toContain(para(2, 4));
    });

    it("holds the passage at the reading line while the Reader takes its shape, until you move the page", async () => {
        const m = await openAt(place(2, "Chapter 2 paragraph 4 holds"));
        await drawn(m.content, 2);
        const landed = 4 * ROW_PX - Math.round(STAGE.height * READING_LINE);
        const reshape = () => {
            (m.view as any).shape = { width: 1, height: 1 };
            (m.view as any).onReshape();
        };
        // The sidebars fold as the Reader opens: the column reflows under the passage.
        m.stage.scrollTop = 120;
        reshape();
        expect(m.stage.scrollTop).toBe(landed);
        // Once you scroll, the page is yours: a reshape keeps your own line instead.
        m.stage.fire("wheel", {});
        m.stage.scrollTop = 120;
        (m.view as any).place = { block: 0, within: 0.6 };
        reshape();
        expect(m.stage.scrollTop).toBe(120);
    });

    it("finds the chapter by its key when the spine has changed, and an old citation by its label", async () => {
        const m = await openAt(place(3, "Chapter 3 paragraph 2 holds", { label: "a label the book no longer uses" }));
        await drawn(m.content, 3);
        expect(here(m.content)[0].textContent).toMatch(/^Chapter 3 paragraph 2/);
        // A 3.6 citation: no key, no words — the chapter the book labels so, at its top.
        const old = await openAt({ file: PATH, label: "3 · Part 3" });
        await drawn(old.content, 3);
        expect(old.stage.scrollTop).toBe(0);
        expect(missing(old.content)).toHaveLength(0);
    });

    it("says once that the words are not in this edition — at its chapter, with no mark anywhere", async () => {
        const debug = jest.spyOn(log, "debug");
        jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick", "queueMicrotask"] });
        const m = await openAt(place(2, "Chapter 2 paragraph 4 was reworded since"));
        await drawn(m.content, 2);
        await settle(() => missing(m.content).length > 0);
        expect(missing(m.content)).toHaveLength(1);
        expect(missing(m.content)[0].textContent).toBe("The passage was not found in this edition. Opened at its chapter.");
        expect(here(m.content)).toHaveLength(0);
        expect(m.stage.scrollTop).toBe(0);
        expect(debug).toHaveBeenCalledWith(expect.stringContaining("was not found"));
        // It leaves by itself, the way it came.
        jest.advanceTimersByTime(6000);
        expect(missing(m.content)[0]?.hasClass(cls("reader-passage-missing--leaving"))).toBe(true);
        jest.advanceTimersByTime(MOTION.fast + 100);
        expect(missing(m.content)).toHaveLength(0);
        // Nothing was written: not the book, not a thought.
        for (const write of [m.vault.modify, m.vault.create, m.vault.process, m.vault.modifyBinary]) expect(write).not.toHaveBeenCalled();
        expect(m.store.write).not.toHaveBeenCalled();
    });

    it("on the book already open: one eased glide, no redraw, and the trail keeps where you were", async () => {
        const m = await openAt(place(1, "Chapter 1 paragraph 0 holds"));
        await drawn(m.content, 1);
        const page = livePage(m.content)!;
        const drawnCount = page.oneByClass("reader-count");
        rec.animations.length = 0;
        await m.view.setState({ source: PATH, chapter: 0, at: serializePlace(place(1, "Chapter 1 paragraph 5 holds")) }, {} as never);
        expect(page.oneByClass("reader-count")).toBe(drawnCount);
        expect(m.stage.scrollTop).toBe(5 * ROW_PX - Math.round(STAGE.height * READING_LINE));
        const glide = rec.animations.filter((a) => a.target === page);
        expect(glide).toHaveLength(1);
        expect(glide[0].options.duration).toBeLessThanOrEqual(MOTION.shotPush);
        expect(glide[0].options.easing).toBe(MOTION.ease);
        expect(Object.keys(glide[0].keyframes[0]).every((key) => ["translate", "opacity"].includes(key))).toBe(true);
        expect((m.view as any).trail.list().map((entry: { reason: string }) => entry.reason)).toEqual(["passage"]);
        // Any key during the glide jumps it to its end.
        m.content.fire("keydown", { key: "j" });
        expect(glide[0].playState).toBe("finished");
    });

    it("in another chapter: the chapter turns towards it, then it lands", async () => {
        const m = await openAt(place(1, "Chapter 1 paragraph 0 holds"));
        await drawn(m.content, 1);
        const view = m.view as any;
        const turns: number[] = [];
        const play = view.turnFrom.bind(view);
        view.turnFrom = (page: unknown) => {
            turns.push(view.turn);
            play(page);
        };
        await m.view.setState({ source: PATH, chapter: 0, at: serializePlace(place(3, "Chapter 3 paragraph 3 holds")) }, {} as never);
        await drawn(m.content, 3);
        expect(turns).toEqual([1]);
        expect(m.stage.scrollTop).toBe(3 * ROW_PX - Math.round(STAGE.height * READING_LINE));
        expect(here(m.content)[0].textContent).toMatch(/^Chapter 3 paragraph 3/);
    });

    it("under reduced motion it is instant: the passage is there, the mark shows for 1.5 s without fading", async () => {
        motion();
        motion = reducedMotion(true);
        jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick", "queueMicrotask"] });
        const m = await openAt(place(2, "Chapter 2 paragraph 4 holds"));
        await drawn(m.content, 2);
        expect(m.stage.scrollTop).toBe(4 * ROW_PX - Math.round(STAGE.height * READING_LINE));
        expect(rec.animations).toHaveLength(0);
        expect(here(m.content).length).toBeGreaterThan(0);
        jest.advanceTimersByTime(HERE_REDUCED_MS + 10);
        expect(here(m.content)).toHaveLength(0);
    });

    it("a highlight made here keeps the chapter's key and the print page it starts on (FR-3, FR-5)", async () => {
        const m = await openAt(place(2, "Chapter 2 paragraph 4 holds"));
        await drawn(m.content, 2);
        const highlights = (m.view as any).highlights;
        await settle(() => highlights.pageMarks.length > 0);
        expect(highlights.pageMarks.map((mark: { label: string }) => mark.label)).toEqual(["40", "41"]);
        const body = m.content.oneByClass("reader-source-body");
        const text = body.textContent ?? "";
        const keep = async (words: string) => {
            const start = text.indexOf(words);
            // What follows the write (the marker sweep, the status line) is not this test's.
            await highlights.keep({ clear: () => undefined }, { start, end: start + words.length }, { exact: words, prefix: "", suffix: "" }, "").catch(() => undefined);
        };
        await keep(para(2, 1));
        await keep(para(2, 5));
        const locators = (m.store.write as jest.Mock).mock.calls.map((call: any[]) => call[1].locator);
        expect(locators).toEqual([
            { at: 1, label: "2 · Part 2", chapter: "OEBPS/text/ch2.xhtml", page: "40" },
            { at: 1, label: "2 · Part 2", chapter: "OEBPS/text/ch2.xhtml", page: "41" },
        ]);
    });

    it("from This note, the book's chip lifts and travels to the reading line — transform and opacity only", () => {
        const body = new DomNode();
        const area = body.createDiv({ cls: "workspace-split mod-root" }) as unknown as DomNode;
        const row = body.createDiv() as unknown as DomNode;
        const chip = row.createEl("button", { text: "tfs · p. 143" }) as unknown as DomNode;
        const box = (left: number, top: number, width: number, height: number) => () => ({ left, top, width, height, right: left + width, bottom: top + height });
        (body as any).getBoundingClientRect = box(0, 0, 1400, 900);
        (area as any).getBoundingClientRect = box(300, 40, 1100, 860);
        (chip as any).getBoundingClientRect = box(1180, 300, 160, 24);
        (chip as any).doc = { body, querySelector: (sel: string) => (sel === ".workspace-split.mod-root" ? area : null) };
        flyOrigin(chip as unknown as HTMLElement);
        const flight = rec.animations.find((a) => a.target.hasClass(cls("reader-origin-ghost")));
        expect(flight).toBeDefined();
        expect(flight!.options.duration).toBe(MOTION.shotPush);
        for (const frame of flight!.keyframes) for (const key of Object.keys(frame)) expect(["transform", "opacity", "offset"]).toContain(key);
        // It lands where the passage will be read: the reading line of the main area.
        expect(String(flight!.keyframes.at(-1)!.transform)).toMatch(/^translate\(-/);
        expect(originLandsAt()).toBeGreaterThan(Date.now());
        // Under reduced motion, nothing flies.
        motion();
        motion = reducedMotion(true);
        rec.animations.length = 0;
        flyOrigin(chip as unknown as HTMLElement);
        expect(rec.animations).toHaveLength(0);
    });

    it("a passage link opens exactly that; a foreign one opens nothing, and says so only in the log", async () => {
        const m = mount();
        const open = jest.fn(async () => undefined);
        const target = place(2, "Chapter 2 paragraph 4 holds");
        const params: Record<string, string> = { action: "zettelflow-read" };
        for (const pair of passageLink(target, "Vault").split("?")[1].split("&")) {
            const [k, v] = pair.split("=");
            params[k] = decodeURIComponent(v);
        }
        expect(openPassageLink(m.app as never, params, open)).toBe(true);
        expect(open).toHaveBeenCalledWith(m.app, { seed: PATH, source: PATH, at: serializePlace({ ...target, label: "" }) });
        // What it opens lands where Born from lands.
        const landed = await openAt({ ...target, label: "" });
        await drawn(landed.content, 2);
        expect(here(landed.content)[0].textContent).toMatch(/^Chapter 2 paragraph 4/);

        const debug = jest.spyOn(log, "debug");
        open.mockClear();
        expect(openPassageLink(m.app as never, { ...params, file: "Notes/a.md" }, open)).toBe(false);
        expect(openPassageLink(m.app as never, { ...params, file: "Books/gone.epub" }, open)).toBe(false);
        expect(openPassageLink(m.app as never, { ...params, extra: "x" }, open)).toBe(false);
        expect(open).not.toHaveBeenCalled();
        expect(debug).toHaveBeenCalledTimes(3);
    });
});
