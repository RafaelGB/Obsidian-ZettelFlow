/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeAll, afterAll, beforeEach, afterEach } from "@jest/globals";
import { TFile, WorkspaceLeaf } from "obsidian";
import { DomNode, settle } from "../../../../support/dashboardDom";
import { press } from "../../../../support/readerKeys";
import { parseXml } from "../../../../support/miniXml";
import { makeEpub } from "../../../../support/zipFixture";
import { withTextNodes } from "../../../../support/domText";
import { recordAnimations, reducedMotion, type AnimationRecord } from "../../../../support/motionDom";
import { pointerDown, pointerUp, touchSwipe } from "../../../../support/pointer";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import { resetReaderWorkspace } from "architecture/components/core/reader/openReader";
import { endChapterTurn } from "architecture/components/core/reader/readerTurn";
import { HERE_MS, HERE_REDUCED_MS } from "architecture/components/core/reader/readerHere";
import { MOTION } from "architecture/components/core/reader/readerMotion";
import type { HighlightStore } from "architecture/components/core/reader/readerHighlights";
import type { Thought } from "application/thinking/thought";

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
/** Three chapters of six paragraphs; the first links to the third, and to an endnote that lives there. */
const BOOK = makeEpub({
    title: "Thinking, Fast and Slow",
    chapters: [1, 2, 3].map((n) => ({
        id: `c${n}`,
        href: `text/ch${n}.xhtml`,
        title: `${n} · Part ${n}`,
        body:
            Array.from({ length: 6 }, (_, i) => `<p>${para(n, i)}</p>`).join("") +
            (n === 1 ? '<p><a href="ch3.xhtml#far">see part three</a> and a note<a epub:type="noteref" href="ch3.xhtml#en1">1</a>.</p>' : "") +
            (n === 3 ? '<p id="far">Where the cross-reference lands.</p><aside epub:type="footnote" id="en1"><p>The endnote, which lives in part three.</p></aside>' : ""),
    })),
});

const ROW_PX = 200;
const STAGE = { left: 0, top: 0, width: 1000, height: 700 };

function mount(thoughts: Thought[] = []) {
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
        metadataCache: { getFirstLinkpathDest: () => null, on: () => ({}) },
    };
    const content = new DomNode();
    const leaf = new WorkspaceLeaf(app, content) as unknown as WorkspaceLeaf & { detach: jest.Mock };
    leaf.detach = jest.fn();
    const host = { settings: { readingMotion: { chapter: "stack" } } as Record<string, any>, saveSettings: jest.fn(async () => undefined) };
    const store: HighlightStore = {
        folder: () => "Lab",
        highlightsAbout: jest.fn(async (path: string) => thoughts.filter((t) => t.about === path)),
        write: jest.fn(async () => undefined),
        save: jest.fn(async () => undefined),
        discard: jest.fn(async () => undefined),
        restore: jest.fn(async () => undefined),
    };
    const view = new ReaderView(leaf, host, { store });
    return { view, content, host, store, vault };
}

/**
 * The stage as a browser would lay it out: 1000 × 700, every block of the chapter 200 px tall, one
 * under the other, moved by the scroll.
 */
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

async function open(thoughts: Thought[] = []) {
    const m = mount(thoughts);
    await m.view.setState({ source: PATH, chapter: 0 }, {} as never);
    await m.view.onOpen();
    await drawn(m.content, 1);
    const laid = layOut(m);
    return { ...m, ...laid };
}

/** The live page: the stage's own — a turning sheet is a copy of the page it leaves. */
const livePage = (content: DomNode) => content.byClass("reader-stage")[0]?.children.find((child) => child.hasClass(cls("reader-page")));
const count = (content: DomNode) => livePage(content)?.byClass("reader-count")[0]?.textContent ?? "";
async function drawn(content: DomNode, chapter: number) {
    await settle(() => count(content) === `Chapter ${chapter} / 3` && (livePage(content)?.byClass("reader-next").length ?? 0) > 0);
}
const ribbon = (content: DomNode) => content.oneByClass("reader-ribbon");
const bookmarks = (m: { host: { settings: Record<string, any> } }) => m.host.settings.library?.[PATH]?.bookmarks ?? [];
const button = (content: DomNode, label: string) => content.byClass("reader-bar-button").find((b) => b.getAttribute("aria-label") === label)!;
const tab = (content: DomNode, label: string) => content.byClass("reader-tab").find((b) => b.textContent === label)!;
const rows = (content: DomNode, name: string) => content.byClass(name);
const reasons = (content: DomNode) => rows(content, "reader-trail-reason").map((r) => r.textContent);
const pill = (content: DomNode) => content.oneByClass("reader-detour-pill");

function openTab(content: DomNode, label: string) {
    if (content.byClass("reader-tabs").length === 0) button(content, "Contents").click();
    tab(content, label).click();
}

/** Click the link whose text is `text`, the way the browser hands it to the chapter body. */
function clickLink(content: DomNode, text: string) {
    const body = content.oneByClass("reader-source-body");
    const link = body.find((el) => el.tag === "a" && el.textContent === text);
    if (!link) throw new Error(`no link "${text}"`);
    body.fire("click", { target: link });
}

describe("bookmarks, and the trail of where you have been (#761)", () => {
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
    });

    async function book(thoughts: Thought[] = []) {
        const m = await open(thoughts);
        restoreLayout = m.restore;
        return m;
    }

    describe("the ribbon (FR-1, FR-2, AC-3)", () => {
        it("bookmarks the first line on screen with a tap, and takes it away with another — in plugin data only", async () => {
            const m = await book();
            expect(ribbon(m.content).hasClass(cls("reader-hidden"))).toBe(false);
            expect(ribbon(m.content).getAttribute("aria-pressed")).toBe("false");
            m.stage.scrollTop = 450;
            ribbon(m.content).click();
            expect(bookmarks(m)).toHaveLength(1);
            // Block 2 is the first on screen at 450 px: its first words are the bookmark's.
            expect(bookmarks(m)[0]).toMatchObject({ chapter: 0, quote: { exact: expect.stringMatching(/^Chapter 1 paragraph 2/) } });
            expect(ribbon(m.content).getAttribute("aria-pressed")).toBe("true");
            expect(ribbon(m.content).hasClass(cls("reader-ribbon--filled"))).toBe(true);
            expect(ribbon(m.content).getAttribute("aria-label")).toBe("Remove this bookmark");
            expect(m.host.saveSettings).toHaveBeenCalled();
            ribbon(m.content).click();
            expect(bookmarks(m)).toHaveLength(0);
            expect(ribbon(m.content).getAttribute("aria-pressed")).toBe("false");
            // A place, not a thought, and no note: nothing reached Think or the vault.
            expect(m.store.write).not.toHaveBeenCalled();
            expect(m.store.save).not.toHaveBeenCalled();
            for (const write of [m.vault.modify, m.vault.create, m.vault.process]) expect(write).not.toHaveBeenCalled();
        });

        it("B does the same, and the shortcuts sheet lists it (FR-13)", async () => {
            const m = await book();
            const evt = press({ view: m.view } as any, "B");
            expect(evt.defaultPrevented).toBe(true);
            expect(bookmarks(m)).toHaveLength(1);
            press({ view: m.view } as any, "B");
            expect(bookmarks(m)).toHaveLength(0);
            press({ view: m.view } as any, "?");
            const labels = m.content.byClass("reader-shortcuts-label").map((l) => l.textContent);
            expect(labels).toContain("Bookmark this place");
        });

        it("is filled only on a screen that holds a bookmark", async () => {
            const m = await book();
            ribbon(m.content).click();
            m.stage.scrollTop = 1000;
            (m.view as any).refreshRibbon();
            expect(ribbon(m.content).getAttribute("aria-pressed")).toBe("false");
            m.stage.scrollTop = 0;
            (m.view as any).refreshRibbon();
            expect(ribbon(m.content).getAttribute("aria-pressed")).toBe("true");
        });

        it("drops in when you bookmark and lifts out when you take it away, on CSS classes (FR-14)", async () => {
            const m = await book();
            ribbon(m.content).click();
            expect(ribbon(m.content).hasClass(cls("reader-ribbon--drop"))).toBe(true);
            ribbon(m.content).click();
            expect(ribbon(m.content).hasClass(cls("reader-ribbon--lift"))).toBe(true);
            // Lifting, it still looks filled — then it is empty.
            expect(ribbon(m.content).hasClass(cls("reader-ribbon--filled"))).toBe(true);
        });

        it("is instant under reduced motion: filled at once, no drop (FR-18)", async () => {
            motion();
            motion = reducedMotion(true);
            const m = await book();
            ribbon(m.content).click();
            expect(ribbon(m.content).hasClass(cls("reader-ribbon--drop"))).toBe(false);
            expect(ribbon(m.content).hasClass(cls("reader-ribbon--filled"))).toBe(true);
        });
    });

    describe("Contents · Bookmarks · Where you've been (FR-4, FR-7, FR-11, AC-4)", () => {
        it("has the three tabs for a book, each empty state saying what to do", async () => {
            const m = await book();
            button(m.content, "Contents").click();
            expect(m.content.byClass("reader-tab").map((b) => b.textContent)).toEqual(["Contents", "Bookmarks", "Where you've been"]);
            expect(tab(m.content, "Contents").getAttribute("aria-selected")).toBe("true");
            tab(m.content, "Bookmarks").click();
            expect(m.content.oneByClass("reader-empty").textContent).toBe("No bookmarks yet. Tap the ribbon, or press B, to keep a place without highlighting anything.");
            tab(m.content, "Where you've been").click();
            expect(m.content.oneByClass("reader-empty").textContent).toBe("Jumps, searches and opened passages leave a trail here.");
        });

        it("lists a bookmark with its chapter, its first words and now, and goes there", async () => {
            const m = await book();
            m.stage.scrollTop = 450;
            press({ view: m.view } as any, "B");
            press({ view: m.view } as any, "ArrowRight");
            await drawn(m.content, 2);
            openTab(m.content, "Bookmarks");
            expect(m.content.oneByClass("reader-mark-where").textContent).toBe("1 · Part 1");
            expect(m.content.oneByClass("reader-mark-snippet").textContent).toMatch(/^Chapter 1 paragraph 2 holds/);
            expect(m.content.oneByClass("reader-mark-snippet").textContent!.length).toBeLessThanOrEqual(80);
            expect(m.content.oneByClass("reader-mark-when").textContent).toBe("now");
            m.content.oneByClass("reader-mark-go").click();
            await drawn(m.content, 1);
            // Landed on the bookmarked line: block 2.
            expect(m.stage.scrollTop).toBe(2 * ROW_PX);
            openTab(m.content, "Where you've been");
            expect(reasons(m.content)).toEqual(["Before a bookmark"]);
        });

        it("removes a bookmark in place", async () => {
            const m = await book();
            press({ view: m.view } as any, "B");
            openTab(m.content, "Bookmarks");
            m.content.oneByClass("reader-mark-remove").click();
            expect(bookmarks(m)).toHaveLength(0);
            expect(m.content.oneByClass("reader-empty").textContent).toMatch(/^No bookmarks yet/);
        });

        it("slides the list in from the side of the tab, in one gesture, on transform and opacity (FR-16)", async () => {
            const m = await book();
            button(m.content, "Contents").click();
            rec.animations.length = 0;
            tab(m.content, "Where you've been").click();
            const slides = rec.animations.filter((a) => a.target.hasClass?.(cls("reader-tab-list")));
            expect(slides).toHaveLength(1);
            expect(slides[0].keyframes[0]).toEqual({ transform: "translateX(24px)", opacity: 0 });
            expect(Object.keys(Object.assign({}, ...slides[0].keyframes))).toEqual(["transform", "opacity"]);
            expect(slides[0].options.duration).toBe(MOTION.base);
            tab(m.content, "Contents").click();
            expect(rec.animations.at(-1)?.keyframes[0]).toEqual({ transform: "translateX(-24px)", opacity: 0 });
        });

        it("counts nothing: no number on the ribbon or the tabs, and the bar unchanged (FR-12, AC-7)", async () => {
            const m = await book();
            // What the bar holds: its controls and its label, before any bookmark or jump.
            const bar = () => ({ label: m.content.oneByClass("reader-bar-label").textContent, parts: m.content.oneByClass("reader-bar").children.length });
            const before = bar();
            for (const top of [0, 800, 1600]) {
                m.stage.scrollTop = top;
                press({ view: m.view } as any, "B");
            }
            clickLink(m.content, "see part three");
            await drawn(m.content, 3);
            press({ view: m.view } as any, "ArrowLeft", { altKey: true });
            await drawn(m.content, 1);
            button(m.content, "Contents").click();
            expect(ribbon(m.content).textContent).not.toMatch(/\d/);
            expect(m.content.oneByClass("reader-tabs").textContent).not.toMatch(/\d/);
            expect(bar()).toEqual(before);
        });

        it("gives a note reading no tabs and no ribbon (FR-5)", async () => {
            const notes = { "a.md": "One.", "b.md": "Two." };
            const app = {
                workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), iterateAllLeaves: () => undefined, setActiveLeaf: jest.fn(), trigger: jest.fn() },
                vault: { getAbstractFileByPath: (p: string) => ((notes as any)[p] ? Object.assign(new TFile(), { path: p, extension: "md" }) : null), cachedRead: async (f: TFile) => (notes as any)[f.path] },
                metadataCache: { getFirstLinkpathDest: () => null, on: () => ({}) },
            };
            const content = new DomNode();
            const leaf = new WorkspaceLeaf(app, content) as unknown as WorkspaceLeaf;
            const view = new ReaderView(leaf, { settings: {}, saveSettings: jest.fn(async () => undefined) } as any);
            await view.setState({ seed: "a.md", kind: "selection", paths: ["a.md", "b.md"] }, {} as never);
            await view.onOpen();
            await settle(() => content.byClass("reader-next").length > 0);
            expect(content.oneByClass("reader-ribbon").hasClass(cls("reader-hidden"))).toBe(true);
            button(content, "Contents").click();
            expect(content.byClass("reader-tabs")).toHaveLength(0);
            expect(press({ view } as any, "B").defaultPrevented).toBe(false);
        });
    });

    describe("every jump leaves a trail (FR-6–FR-9, AC-5)", () => {
        it("a link, Contents, Go to note, a bookmark and a search each leave their place, newest first", async () => {
            const m = await book();
            clickLink(m.content, "see part three");
            await drawn(m.content, 3);
            // Contents → the first part.
            button(m.content, "Contents").click();
            m.content.byClass("reader-toc-row")[0].click();
            await drawn(m.content, 1);
            // A footnote's Go to note.
            clickLink(m.content, "1");
            await settle(() => m.content.byClass("reader-note-pop").length > 0);
            m.content.oneByClass("reader-note-pop-go").click();
            await drawn(m.content, 3);
            // A bookmark made here, then gone to from the list.
            press({ view: m.view } as any, "B");
            openTab(m.content, "Bookmarks");
            m.content.oneByClass("reader-mark-go").click();
            openTab(m.content, "Where you've been");
            expect(reasons(m.content)).toEqual(["Before a bookmark", "Before a footnote", "Before Contents", "Before a link"]);
            expect(rows(m.content, "reader-trail-where").map((r) => r.textContent)).toEqual(["3 · Part 3", "1 · Part 1", "3 · Part 3", "1 · Part 1"]);
        });

        it("a search leaves its place once, in the same chapter and in another", async () => {
            const m = await book();
            button(m.content, "Search in the book").click();
            const input = m.content.oneByClass("reader-search-input");
            input.value = "paragraph 5";
            input.fire("input");
            await settle(() => (m.content.oneByClass("reader-search-count").textContent ?? "").includes("result"));
            input.fire("keydown", { key: "Enter" });
            expect(count(m.content)).toBe("Chapter 1 / 3");
            input.fire("keydown", { key: "Enter" });
            await drawn(m.content, 2);
            expect(pill(m.content).hasClass(cls("reader-hidden"))).toBe(false);
            openTab(m.content, "Where you've been");
            expect(reasons(m.content)).toEqual(["Before a search"]);
        });

        it("a passage opened from Think while the book is open leaves the place you left", async () => {
            const thoughts = [
                { id: "h1", at: 1, text: "", links: [], about: PATH, quote: { exact: "Chapter 3 paragraph 4 holds", prefix: "", suffix: "" }, locator: { at: 2, label: "3 · Part 3" } },
            ] as unknown as Thought[];
            const m = await book(thoughts);
            await m.view.setState({ source: PATH, chapter: 2, highlight: "h1" }, {} as never);
            await drawn(m.content, 3);
            openTab(m.content, "Where you've been");
            expect(reasons(m.content)).toEqual(["Before an opened passage"]);
            expect(rows(m.content, "reader-trail-where").map((r) => r.textContent)).toEqual(["1 · Part 1"]);
        });

        it("a passage in the chapter on screen is a glide to it, never a fresh draw, and shows you are there", async () => {
            const thoughts = [
                { id: "h2", at: 1, text: "", links: [], about: PATH, quote: { exact: "Chapter 1 paragraph 4 holds", prefix: "", suffix: "" }, locator: { at: 0, label: "1 · Part 1" } },
            ] as unknown as Thought[];
            const m = await book(thoughts);
            await settle(() => m.content.byClass("reader-highlight").length > 0);
            const page = livePage(m.content)!;
            const drawnCount = page.oneByClass("reader-count");
            rec.animations.length = 0;
            await m.view.setState({ source: PATH, chapter: 0, highlight: "h2" }, {} as never);
            // The same page, not drawn again: the camera moved.
            expect(page.oneByClass("reader-count")).toBe(drawnCount);
            expect(m.stage.scrollTop).toBeGreaterThan(0);
            expect(rec.animations.filter((a) => a.target === page && "translate" in a.keyframes[0])).toHaveLength(1);
            expect(m.content.oneByClass("reader-highlight").hasClass(cls("reader-here"))).toBe(true);
            openTab(m.content, "Where you've been");
            expect(reasons(m.content)).toEqual(["Before an opened passage"]);
        });

        it("the pill and Alt+← walk the same trail; a row taken from the list leaves it alone", async () => {
            const m = await book();
            m.stage.scrollTop = 450;
            clickLink(m.content, "see part three");
            await drawn(m.content, 3);
            button(m.content, "Contents").click();
            m.content.byClass("reader-toc-row")[1].click();
            await drawn(m.content, 2);
            openTab(m.content, "Where you've been");
            expect(reasons(m.content)).toEqual(["Before Contents", "Before a link"]);
            // The older row: back to the line the link left from, and only that row goes.
            rows(m.content, "reader-trail-row")[1].click();
            await drawn(m.content, 1);
            expect(m.stage.scrollTop).toBe(2 * ROW_PX);
            expect(reasons(m.content)).toEqual(["Before Contents"]);
            // Alt+← takes the next one: the place before Contents.
            expect(press({ view: m.view } as any, "ArrowLeft", { altKey: true }).defaultPrevented).toBe(true);
            await drawn(m.content, 3);
            expect(reasons(m.content)).toEqual([]);
            expect(pill(m.content).hasClass(cls("reader-hidden"))).toBe(true);
        });

        it("an ordinary turn keeps the trail and puts the pill away (G1)", async () => {
            const m = await book();
            clickLink(m.content, "see part three");
            await drawn(m.content, 3);
            press({ view: m.view } as any, "ArrowLeft");
            await drawn(m.content, 2);
            expect(pill(m.content).hasClass(cls("reader-hidden"))).toBe(true);
            openTab(m.content, "Where you've been");
            expect(reasons(m.content)).toEqual(["Before a link"]);
            expect(press({ view: m.view } as any, "ArrowLeft", { altKey: true }).defaultPrevented).toBe(true);
            await drawn(m.content, 1);
        });

        it("is forgotten with a new reading (FR-9)", async () => {
            const m = await book();
            clickLink(m.content, "see part three");
            await drawn(m.content, 3);
            (m.view as any).sourcePath = "Books/other.epub";
            await m.view.setState({ source: PATH, chapter: 0 }, {} as never);
            expect((m.view as any).trail.size).toBe(0);
        });
    });

    describe("back with two fingers on iPad (FR-10, AC-6)", () => {
        const finger = (m: any, type: string, id: number, x: number, y: number, kind = "touch") =>
            m.stage.fire(type, { pointerType: kind, pointerId: id, isPrimary: id === 1, clientX: x, clientY: y, timeStamp: Date.now(), target: m.stage, button: 0 });

        it("two fingers swept right go back one step; a mouse, or one finger from the edge, never does", async () => {
            const m = await book();
            clickLink(m.content, "see part three");
            await drawn(m.content, 3);
            // One finger from the very edge: Obsidian's strip, never ours (EDGE_BACK_SWIPE stays off).
            touchSwipe(m.stage, { x: 10, y: 300 }, { x: 300, y: 300 });
            expect(count(m.content)).toBe("Chapter 3 / 3");
            // A mouse with two buttons is not two fingers.
            finger(m, "pointerdown", 1, 300, 300, "mouse");
            finger(m, "pointerdown", 2, 300, 400, "mouse");
            finger(m, "pointerup", 1, 500, 300, "mouse");
            finger(m, "pointerup", 2, 500, 400, "mouse");
            expect(count(m.content)).toBe("Chapter 3 / 3");
            // Two fingers, together, to the right.
            finger(m, "pointerdown", 1, 300, 300);
            finger(m, "pointerdown", 2, 300, 400);
            finger(m, "pointermove", 1, 400, 305);
            finger(m, "pointermove", 2, 400, 405);
            finger(m, "pointerup", 1, 420, 305);
            finger(m, "pointerup", 2, 420, 405);
            await drawn(m.content, 1);
        });

        it("two fingers that pinch, or go left, do nothing", async () => {
            const m = await book();
            clickLink(m.content, "see part three");
            await drawn(m.content, 3);
            finger(m, "pointerdown", 1, 300, 300);
            finger(m, "pointerdown", 2, 600, 300);
            finger(m, "pointerup", 1, 400, 300);
            finger(m, "pointerup", 2, 500, 300);
            pointerDown(m.stage, { x: 500, y: 300 });
            pointerUp(m.stage, { x: 500, y: 300 }, 50);
            expect(count(m.content)).toBe("Chapter 3 / 3");
        });
    });

    describe("going to a place is a camera move, never a cut (FR-15–FR-18, AC-8)", () => {
        it("in the chapter on screen the column glides back, on translate, proportional and capped", async () => {
            const m = await book();
            m.stage.scrollTop = 450;
            button(m.content, "Contents").click();
            // A Contents entry for this very part: back up to its start, as one move.
            rec.animations.length = 0;
            m.content.byClass("reader-toc-row")[0].click();
            expect(m.stage.scrollTop).toBe(0);
            const page = m.content.oneByClass("reader-page");
            const glide = rec.animations.filter((a) => a.target === page);
            expect(glide).toHaveLength(1);
            // From where it was: the page starts 450 px up, where your eyes were, and lands.
            expect(glide[0].keyframes).toEqual([{ translate: "0px -450px" }, { translate: "0px 0px" }]);
            expect(glide[0].options.easing).toBe(MOTION.ease);
            // The way back glides down again.
            pill(m.content).click();
            expect(m.stage.scrollTop).toBe(2 * ROW_PX);
            expect(rec.animations.at(-1)?.keyframes[0]).toEqual({ translate: "0px 400px" });
        });

        it("across chapters turns the chapter towards the place, and the way back is the reverse", async () => {
            const m = await book();
            const view = m.view as any;
            const turns: number[] = [];
            const play = view.turnFrom.bind(view);
            view.turnFrom = (page: unknown) => {
                turns.push(view.turn);
                play(page);
            };
            clickLink(m.content, "see part three");
            await drawn(m.content, 3);
            press({ view: m.view } as any, "ArrowLeft", { altKey: true });
            await drawn(m.content, 1);
            expect(turns).toEqual([1, -1]);
        });

        it("marks the landing for a moment with you are here — under the words, never the old flash", async () => {
            const m = await book();
            m.stage.scrollTop = 450;
            press({ view: m.view } as any, "B");
            m.stage.scrollTop = 1100;
            jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick", "queueMicrotask"] });
            openTab(m.content, "Bookmarks");
            m.content.oneByClass("reader-mark-go").click();
            const here = m.content.byClass("reader-here");
            expect(here.length).toBeGreaterThan(0);
            expect(here[0].textContent).toMatch(/^Chapter 1 paragraph 2/);
            expect(m.content.byClass("reader-highlight--flash")).toHaveLength(0);
            // It waits for the travel to land.
            expect(here[0].cssProps["--zf-here-delay"]).toMatch(/^[1-9]\d*ms$/);
            jest.advanceTimersByTime(HERE_MS + 600);
            expect(m.content.byClass("reader-here")).toHaveLength(0);
            // The words are exactly as they were.
            expect(m.content.oneByClass("reader-source-body").textContent).toContain(para(1, 2));
        });

        it("under reduced motion every move is instant and still lands, the mark shown without fading", async () => {
            motion();
            motion = reducedMotion(true);
            const m = await book();
            m.stage.scrollTop = 450;
            clickLink(m.content, "see part three");
            await drawn(m.content, 3);
            jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick", "queueMicrotask"] });
            press({ view: m.view } as any, "ArrowLeft", { altKey: true });
            jest.useRealTimers();
            await drawn(m.content, 1);
            expect(m.stage.scrollTop).toBe(2 * ROW_PX);
            expect(rec.animations).toHaveLength(0);
            expect(HERE_REDUCED_MS).toBe(1500);
        });
    });
});
