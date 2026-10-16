/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeAll, afterAll, beforeEach, afterEach } from "@jest/globals";
import { TFile, WorkspaceLeaf } from "obsidian";
import { DomNode, settle } from "../../../../support/dashboardDom";
import { kicker, place } from "../../../../support/readerPlace";
import { press } from "../../../../support/readerKeys";
import { parseXml } from "../../../../support/miniXml";
import { makeEpub } from "../../../../support/zipFixture";
import { withTextNodes } from "../../../../support/domText";
import { recordAnimations, reducedMotion, type AnimationRecord } from "../../../../support/motionDom";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import { resetReaderWorkspace } from "architecture/components/core/reader/openReader";
import { endChapterTurn } from "architecture/components/core/reader/readerTurn";
import { SURVIVED_MIN_MS } from "architecture/components/core/reader/readerSurvived";
import type { HighlightStore } from "architecture/components/core/reader/readerHighlights";
import type { Thought } from "application/thinking/thought";

/**
 * **What survived?** over a mounted Reader (#755 AC-5, AC-6, AC-7): a reading turn past a marked,
 * long chapter read for two minutes brings the leaf, through the chapter's own turn; nothing else
 * does, and nothing on it writes.
 */

const g = globalThis as any;
const PATH = "Books/middlemarch.epub";
const cls = (name: string) => `zettelkasten-flow__${name}`;

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.name = path.split("/").pop() ?? path;
    f.extension = path.split(".").pop() ?? "";
    (f as any).stat = { size: 10, mtime: 20, ctime: 1 };
    return f;
}

const WORDS = Array.from({ length: 300 }, (_, i) => `word${i % 7 === 0 ? "s" : ""}`).join(" ");
/** Four chapters of six paragraphs of three hundred words: every one a real chapter (FR-2.2). */
const BOOK = makeEpub({
    title: "Middlemarch",
    chapters: [1, 2, 3, 4].map((n) => ({
        id: `c${n}`,
        href: `text/ch${n}.xhtml`,
        title: ["Prelude", "Miss Brooke", "Old and young", "Waiting for death"][n - 1],
        body: Array.from({ length: 6 }, (_, i) => `<p>Chapter ${n} paragraph ${i}: ${WORDS}</p>`).join(""),
    })),
});

const STAGE = { left: 0, top: 0, width: 1000, height: 700 };
const ROW_PX = 200;

function mark(id: string, chapter: number, over: Partial<Thought> = {}): Thought {
    return {
        id,
        at: 1,
        text: "",
        links: [],
        about: PATH,
        quote: { exact: `Chapter ${chapter + 1} paragraph 1`, prefix: "", suffix: "" },
        locator: { at: chapter, label: `Chapter ${chapter + 1}`, chapter: `text/ch${chapter + 1}.xhtml` },
        meaning: "idea",
        ...over,
    } as Thought;
}

let now = 1_000_000;

function mount(thoughts: Thought[], prefs: Record<string, unknown> = {}) {
    const book = file(PATH);
    const vault = {
        getAbstractFileByPath: (path: string) => (path === book.path ? book : null),
        readBinary: async () => BOOK.buffer.slice(BOOK.byteOffset, BOOK.byteOffset + BOOK.byteLength),
        cachedRead: async () => "",
        modify: jest.fn(),
        create: jest.fn(),
        process: jest.fn(),
    };
    const app = {
        workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), iterateAllLeaves: () => undefined, setActiveLeaf: jest.fn(), trigger: jest.fn() },
        vault,
        metadataCache: { getFirstLinkpathDest: () => null, on: () => ({}), getFileCache: () => null },
    };
    const content = new DomNode();
    const leaf = new WorkspaceLeaf(app, content) as unknown as WorkspaceLeaf & { detach: jest.Mock };
    leaf.detach = jest.fn();
    const host = { settings: { readingMotion: { chapter: "leaf" }, readerPrefs: { font: "sans", size: "medium", theme: "auto", ...prefs } } as Record<string, any>, saveSettings: jest.fn(async () => undefined) };
    const store: HighlightStore = {
        folder: () => "Lab",
        highlightsAbout: jest.fn(async (path: string) => thoughts.filter((t) => t.about === path)),
        write: jest.fn(async () => undefined),
        save: jest.fn(async () => undefined),
        discard: jest.fn(async () => undefined),
        restore: jest.fn(async () => undefined),
    };
    const toNote = jest.fn();
    const view = new ReaderView(leaf, host, { store, toNote });
    return { view, content, host, store, vault, toNote };
}

function layOut(content: DomNode) {
    const stage = content.oneByClass("reader-stage") as any;
    stage.clientHeight = STAGE.height;
    Object.defineProperty(stage, "scrollHeight", { configurable: true, get: () => 3000 });
    const proto = DomNode.prototype as any;
    const plain = proto.getBoundingClientRect;
    proto.getBoundingClientRect = function (this: DomNode) {
        if (this === stage) return { ...STAGE };
        return { left: 100, top: 0, width: 700, height: ROW_PX };
    };
    return { stage, restore: () => (proto.getBoundingClientRect = plain) };
}

const livePage = (content: DomNode) => content.byClass("reader-stage")[0]?.children.find((child) => child.hasClass(cls("reader-page")));
const count = (content: DomNode) => place(content);
const leafOn = (content: DomNode) => (livePage(content)?.byClass("reader-survived").length ?? 0) > 0;
async function drawn(content: DomNode, chapter: number) {
    await settle(() => count(content) === `Chapter ${chapter} / 4` && (livePage(content)?.byClass("reader-next").length ?? 0) > 0);
}
/** The chapter turns played so far: each lays one sheet over the stage. */
const turns = (rec: AnimationRecord) => rec.animations.filter((a) => (a.target as DomNode).hasClass?.(cls("turn-sheet")) || (a.target as DomNode).parent?.hasClass?.(cls("turn-sheet")));

describe("what survived, over the Reader (#755)", () => {
    let undoText: () => void;
    let rec: AnimationRecord;
    let motion: () => void;
    let restore: (() => void) | null = null;
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
        now = 1_000_000;
        jest.spyOn(Date, "now").mockImplementation(() => now);
    });
    afterEach(() => {
        endChapterTurn();
        restore?.();
        restore = null;
        rec.stop();
        motion();
        jest.restoreAllMocks();
    });

    async function open(thoughts: Thought[], prefs: Record<string, unknown> = {}, chapter = 0) {
        const m = mount(thoughts, prefs);
        await m.view.setState({ source: PATH, chapter }, {} as never);
        await m.view.onOpen();
        await drawn(m.content, chapter + 1);
        const laid = layOut(m.content);
        restore = laid.restore;
        // The marks are read when the book opens; the chapter's own attach reads them again.
        await settle(() => (m.store.highlightsAbout as jest.Mock).mock.calls.length >= 2);
        await Promise.resolve();
        return { ...m, ...laid };
    }

    /** Read on: the clock moves on, and the reader turns the way it reads. */
    function read(ms: number) {
        now += ms;
    }

    it("a reading turn past a marked chapter read for two minutes turns onto the leaf, by the chapter's own turn (AC-7)", async () => {
        const m = await open([mark("h1", 0)]);
        read(SURVIVED_MIN_MS + 1000);
        const before = new Set(m.content.findAll(() => true));
        const played = turns(rec).length;
        press({ view: m.view } as any, "ArrowRight");
        await settle(() => leafOn(m.content));
        expect(turns(rec).length).toBeGreaterThan(played);
        const leaf = livePage(m.content)!.oneByClass("reader-survived");
        expect(kicker(leaf)).toBe("End of chapter 1");
        expect(leaf.oneByClass("reader-chapter-title").textContent).toBe("What survived?");
        expect(leaf.oneByClass("reader-survived-chapter").textContent).toBe("Prelude");
        expect(leaf.byClass("reader-survived-mark").map((row) => row.getAttribute("data-hl"))).toEqual(["h1"]);
        // A page, never a window over the text: nothing modal, nothing dimming it.
        const added = m.content.findAll(() => true).filter((el) => !before.has(el) && !el.parent?.hasClass?.(cls("turn-sheet")) && !el.hasClass(cls("turn-sheet")));
        for (const el of added) {
            expect(el.getAttribute("role")).not.toBe("dialog");
            expect(el.getAttribute("aria-modal")).toBeNull();
            expect([...el.classes].join(" ")).not.toMatch(/scrim|backdrop|overlay|modal/);
        }
        // The bar still says where you are: the chapter you just finished.
        expect(m.content.oneByClass("reader-bar-label").textContent).toBe("Chapter 1 / 4");
    });

    it("→ or Space on the leaf turn on to the next chapter, by the same turn (AC-6)", async () => {
        const m = await open([mark("h1", 0)]);
        read(SURVIVED_MIN_MS + 1000);
        press({ view: m.view } as any, "ArrowRight");
        await settle(() => leafOn(m.content));
        read(10_000);
        const played = turns(rec).length;
        press({ view: m.view } as any, " ");
        await drawn(m.content, 2);
        expect(leafOn(m.content)).toBe(false);
        expect(turns(rec).length).toBeGreaterThan(played);
    });

    it("lists a mark made a moment ago, before the vault's cache has it (found in the walk)", async () => {
        const m = await open([mark("h1", 0), mark("h2", 0, { quote: { exact: "Chapter 1 paragraph 3", prefix: "", suffix: "" }, meaning: "question" })]);
        // The page holds both; the store, read again, does not have the newest yet.
        (m.store.highlightsAbout as jest.Mock).mockImplementation(async () => [mark("h1", 0)]);
        await (m.view as any).readSurvivedMarks();
        read(SURVIVED_MIN_MS + 1000);
        press({ view: m.view } as any, "ArrowRight");
        await settle(() => leafOn(m.content));
        expect(m.content.byClass("reader-survived-mark").map((row) => row.getAttribute("data-hl"))).toEqual(["h1", "h2"]);
    });

    it("← on the leaf turns back onto the chapter's last page (AC-6, FR-14)", async () => {
        const m = await open([mark("h1", 0)]);
        read(SURVIVED_MIN_MS + 1000);
        press({ view: m.view } as any, "ArrowRight");
        await settle(() => leafOn(m.content));
        const played = turns(rec).length;
        press({ view: m.view } as any, "ArrowLeft");
        await drawn(m.content, 1);
        expect(leafOn(m.content)).toBe(false);
        expect(turns(rec).length).toBeGreaterThan(played);
        // At its end: the stage scrolled to the bottom.
        expect(m.stage.scrollTop).toBeGreaterThan(0);
    });

    it("← at once is no skip: turning on again from the chapter's end pauses again (found in the walk)", async () => {
        const m = await open([mark("h1", 0)]);
        read(SURVIVED_MIN_MS + 1000);
        press({ view: m.view } as any, "ArrowRight");
        await settle(() => leafOn(m.content));
        read(500);
        press({ view: m.view } as any, "ArrowLeft");
        await drawn(m.content, 1);
        press({ view: m.view } as any, "ArrowRight");
        await settle(() => leafOn(m.content));
        expect(leafOn(m.content)).toBe(true);
    });

    it("never pauses on a chapter with nothing marked, read however long (the owner's decision)", async () => {
        const m = await open([mark("h3", 2)]);
        read(10 * 60_000);
        press({ view: m.view } as any, "ArrowRight");
        await drawn(m.content, 2);
        expect(leafOn(m.content)).toBe(false);
    });

    it("never pauses before two minutes on the chapter in this sitting", async () => {
        const m = await open([mark("h1", 0)]);
        read(SURVIVED_MIN_MS - 5000);
        press({ view: m.view } as any, "ArrowRight");
        await drawn(m.content, 2);
        expect(leafOn(m.content)).toBe(false);
    });

    it("never pauses on a jump: Contents, End, Home, a resume (FR-2.1)", async () => {
        const m = await open([mark("h1", 0), mark("h2", 1)]);
        read(SURVIVED_MIN_MS + 1000);
        (m.content.oneByClass("reader-bar") as any);
        press({ view: m.view } as any, "End");
        await drawn(m.content, 4);
        expect(leafOn(m.content)).toBe(false);
        press({ view: m.view } as any, "Home");
        await drawn(m.content, 1);
        expect(leafOn(m.content)).toBe(false);
        await m.view.setState({ source: PATH, chapter: 1 }, {} as never);
        await drawn(m.content, 2);
        expect(leafOn(m.content)).toBe(false);
    });

    it("a skip — off within four seconds, untouched — keeps the next end from pausing; the one after may (FR-7)", async () => {
        const m = await open([mark("h1", 0), mark("h2", 1), mark("h3", 2)]);
        read(SURVIVED_MIN_MS + 1000);
        press({ view: m.view } as any, "ArrowRight");
        await settle(() => leafOn(m.content));
        read(1000);
        press({ view: m.view } as any, "ArrowRight");
        await drawn(m.content, 2);
        read(SURVIVED_MIN_MS + 1000);
        press({ view: m.view } as any, "ArrowRight");
        await drawn(m.content, 3);
        expect(leafOn(m.content)).toBe(false);
        read(SURVIVED_MIN_MS + 1000);
        press({ view: m.view } as any, "ArrowRight");
        await settle(() => leafOn(m.content));
        expect(livePage(m.content)!.oneByClass("reader-count").textContent).toBe("End of chapter 3");
    });

    it("never pauses at the last chapter: the end card has that place", async () => {
        const m = await open([mark("h4", 3)], {}, 3);
        read(SURVIVED_MIN_MS + 1000);
        press({ view: m.view } as any, "ArrowRight");
        await settle(() => m.content.byClass("reader-end").length > 0);
        expect(leafOn(m.content)).toBe(false);
    });

    it("Write a note asks the preview for the chosen mark, from its row; leaving the leaf writes nothing (AC-5)", async () => {
        const m = await open([mark("h1", 0)]);
        read(SURVIVED_MIN_MS + 1000);
        press({ view: m.view } as any, "ArrowRight");
        await settle(() => leafOn(m.content));
        const row = m.content.oneByClass("reader-survived-mark");
        row.oneByClass("reader-survived-pick").click();
        row.oneByClass("reader-survived-write").click();
        expect(m.toNote).toHaveBeenCalledTimes(1);
        expect((m.toNote.mock.calls[0] as any[])[1]).toMatchObject({ id: "h1" });
        expect((m.toNote.mock.calls[0] as any[])[2]).toEqual({ left: 100, top: 0, width: 700, height: ROW_PX });
        press({ view: m.view } as any, "ArrowRight");
        await drawn(m.content, 2);
        for (const write of [m.vault.modify, m.vault.create, m.vault.process]) expect(write).not.toHaveBeenCalled();
        expect(m.store.write).not.toHaveBeenCalled();
        expect(m.store.save).not.toHaveBeenCalled();
    });

    it("the three switches share one value: the leaf's Don't pause turns off the Type panel's (AC-6)", async () => {
        const m = await open([mark("h1", 0), mark("h2", 1)]);
        read(SURVIVED_MIN_MS + 1000);
        press({ view: m.view } as any, "ArrowRight");
        await settle(() => leafOn(m.content));
        m.content.oneByClass("reader-survived-quiet").click();
        expect(m.host.settings.readerPrefs.chapterPause).toBe(false);
        const type = m.content.byClass("reader-bar-button").find((b) => b.getAttribute("aria-label") === "Type")!;
        type.click();
        const toggle = m.content.byClass("reader-focus-toggle").find((b) => b.textContent === "Pause at chapter ends")!;
        expect(toggle.getAttribute("aria-pressed")).toBe("false");
        // Off, the next marked end turns as it always has.
        press({ view: m.view } as any, "ArrowRight");
        await drawn(m.content, 2);
        read(SURVIVED_MIN_MS + 1000);
        press({ view: m.view } as any, "ArrowRight");
        await drawn(m.content, 3);
        expect(leafOn(m.content)).toBe(false);
        // And on again from the Type panel.
        m.content.byClass("reader-focus-toggle").find((b) => b.textContent === "Pause at chapter ends")!.click();
        expect(m.host.settings.readerPrefs.chapterPause).toBe(true);
    });

    it("Settings → Reading turned off while the book is open: no pause, and the Type panel says off (found in the walk)", async () => {
        const m = await open([mark("h1", 0)]);
        m.host.settings.readerPrefs = { ...m.host.settings.readerPrefs, chapterPause: false };
        read(SURVIVED_MIN_MS + 1000);
        press({ view: m.view } as any, "ArrowRight");
        await drawn(m.content, 2);
        expect(leafOn(m.content)).toBe(false);
        m.content.byClass("reader-bar-button").find((b) => b.getAttribute("aria-label") === "Type")!.click();
        const toggle = m.content.byClass("reader-focus-toggle").find((b) => b.textContent === "Pause at chapter ends")!;
        expect(toggle.getAttribute("aria-pressed")).toBe("false");
    });

    it("never pauses while listening (FR-2.7)", async () => {
        const m = await open([mark("h1", 0)]);
        m.view.listening = true;
        read(SURVIVED_MIN_MS + 1000);
        press({ view: m.view } as any, "ArrowRight");
        await drawn(m.content, 2);
        expect(leafOn(m.content)).toBe(false);
    });

    it("the shortcuts sheet names → and ← on the leaf (FR-10)", async () => {
        const m = await open([]);
        press({ view: m.view } as any, "?");
        const labels = m.content.byClass("reader-shortcuts-label").map((l) => l.textContent);
        expect(labels).toEqual(expect.arrayContaining(["On a chapter's end: keep reading", "On a chapter's end: back to the chapter"]));
    });

    it("under reduced motion the leaf is there at once: no turn, no settle (FR-15, AC-7)", async () => {
        motion();
        motion = reducedMotion(true);
        const m = await open([mark("h1", 0)]);
        read(SURVIVED_MIN_MS + 1000);
        rec.animations.length = 0;
        press({ view: m.view } as any, "ArrowRight");
        await settle(() => leafOn(m.content));
        expect(rec.animations).toHaveLength(0);
        press({ view: m.view } as any, "ArrowRight");
        await drawn(m.content, 2);
        expect(rec.animations).toHaveLength(0);
    });
});
