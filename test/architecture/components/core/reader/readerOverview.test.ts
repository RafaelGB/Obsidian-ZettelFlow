/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeAll, afterAll, beforeEach, afterEach } from "@jest/globals";
import { Component, TFile, WorkspaceLeaf, __setPdfJs } from "obsidian";
import { DomNode, flush, settle } from "../../../../support/dashboardDom";
import { press } from "../../../../support/readerKeys";
import { parseXml } from "../../../../support/miniXml";
import { makeEpub } from "../../../../support/zipFixture";
import { withTextNodes } from "../../../../support/domText";
import { makePdfJs, prose, type FakePage } from "../../../../support/fakePdf";
import { recordAnimations, reducedMotion, type AnimationRecord, type FakeAnimation } from "../../../../support/motionDom";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import { resetReaderWorkspace } from "architecture/components/core/reader/openReader";
import { endChapterTurn } from "architecture/components/core/reader/readerTurn";
import { flightTransform, MOTION } from "architecture/components/core/reader/readerMotion";
import { renderOverview, type OverviewOptions } from "architecture/components/core/reader/readerOverview";
import type { HighlightStore } from "architecture/components/core/reader/readerHighlights";
import type { Thought } from "application/thinking/thought";
import { log } from "architecture";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

/**
 * **The overview, through the Reader** (#776): the bar's door, the tab, the cards of a flowing book
 * and of a paper in both views, the marks and the hairline, going there and coming back as camera
 * moves, the keyboard — and nothing written. The fake DOM has no layout: the stage is given a size,
 * and each block of a chapter is 200 px tall, one under the other.
 */

const g = globalThis as any;
const cls = (name: string) => `zettelkasten-flow__${name}`;
const EPUB = "Books/thinking.epub";
const PDF = "Papers/cap.pdf";
const STAGE = { left: 0, top: 0, width: 1000, height: 700 };
const ROW_PX = 200;
const NAMES = ["Part one", "Part two", "Part three", "Part four", "Part five"];

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.name = path.split("/").pop() ?? path;
    f.extension = path.split(".").pop() ?? "";
    (f as any).stat = { size: 10, mtime: 20, ctime: 1 };
    return f;
}

const sentence = (chapter: number, i: number) => `In ${NAMES[chapter]} the paragraph ${i} holds a sentence long enough to be a line of its own.`;
const BOOK = makeEpub({
    title: "Thinking, Fast and Slow",
    chapters: NAMES.map((name, n) => ({
        id: `c${n}`,
        href: `text/ch${n}.xhtml`,
        title: name,
        body: Array.from({ length: 20 }, (_, i) => `<p>${sentence(n, i)}</p>`).join(""),
    })),
});

function thought(over: Partial<Thought> & { at: number }): Thought {
    const { at, ...rest } = over;
    return { id: `t${at}${rest.meaning ?? ""}${rest.ink ? "i" : ""}`, at: 1, text: "", links: [], about: EPUB, locator: { at, label: `Ch. ${at + 1}` }, ...rest } as Thought;
}

function mountBook(thoughts: Thought[] = [], settings: Record<string, any> = {}) {
    const book = file(EPUB);
    const vault = {
        getAbstractFileByPath: (path: string) => (path === book.path ? book : null),
        readBinary: async () => BOOK.buffer.slice(BOOK.byteOffset, BOOK.byteOffset + BOOK.byteLength),
        cachedRead: async () => "",
        modify: jest.fn(),
        modifyBinary: jest.fn(),
        create: jest.fn(),
        createBinary: jest.fn(),
        process: jest.fn(),
    };
    const app = {
        workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), iterateAllLeaves: () => undefined, setActiveLeaf: jest.fn(), trigger: jest.fn() },
        vault,
        metadataCache: { getFirstLinkpathDest: () => null, on: () => ({}) },
        fileManager: { processFrontMatter: jest.fn(), renameFile: jest.fn() },
    };
    const content = new DomNode();
    const leaf = new WorkspaceLeaf(app, content) as unknown as WorkspaceLeaf & { detach: jest.Mock };
    leaf.detach = jest.fn();
    const host = { settings: { readingMotion: { chapter: "stack" }, ...settings } as Record<string, any>, saveSettings: jest.fn(async () => undefined) };
    const store: HighlightStore = {
        folder: () => "Lab",
        highlightsAbout: jest.fn(async (path: string) => thoughts.filter((t) => t.about === path)),
        write: jest.fn(async () => undefined),
        save: jest.fn(async () => undefined),
        discard: jest.fn(async () => undefined),
        restore: jest.fn(async () => undefined),
    };
    const view = new ReaderView(leaf, host, { store });
    return { view, content, host, store, vault, app };
}

const livePage = (content: DomNode) => content.byClass("reader-stage")[0]?.children.find((child) => child.hasClass(cls("reader-page")));
const count = (content: DomNode) => livePage(content)?.byClass("reader-count")[0]?.textContent ?? "";
const drawnChapter = (content: DomNode, chapter: number, total = NAMES.length) =>
    settle(() => count(content) === `Chapter ${chapter} / ${total}` && (livePage(content)?.byClass("reader-next").length ?? 0) > 0);
const bar = (content: DomNode, label: string) => content.byClass("reader-bar-button").find((b) => b.getAttribute("aria-label") === label)!;
const tab = (content: DomNode, label: string) => content.byClass("reader-tab").find((b) => b.textContent === label)!;
const cards = (content: DomNode) => content.oneByClass("reader-panel").byClass("reader-overview-card");
const panelOpen = (content: DomNode) => content.oneByClass("reader-panel").hasClass(cls("reader-panel--open"));
const boxOf = (el: DomNode) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
};

/** Every card's box: in a grid of three, 100 × 130 each, from the panel's corner. */
const CARD_BOX = (i: number) => ({ left: 500 + (i % 3) * 110, top: 100 + Math.floor(i / 3) * 150, width: 100, height: 130 });

function layOut(m: { content: DomNode; view: ReaderView }) {
    const stage = m.content.oneByClass("reader-stage") as any;
    stage.clientHeight = STAGE.height;
    const blocks = () => ((m.view as any).pager?.blocks() ?? []) as DomNode[];
    Object.defineProperty(stage, "scrollHeight", { configurable: true, get: () => Math.max(STAGE.height, blocks().length * ROW_PX) });
    const proto = DomNode.prototype as any;
    const plain = proto.getBoundingClientRect;
    proto.getBoundingClientRect = function (this: DomNode) {
        if (this === stage) return { ...STAGE };
        if (this.classes.has(cls("reader-overview-sheet"))) {
            const card = this.parent as DomNode;
            const at = Number(card?.getAttribute("data-unit"));
            return CARD_BOX(Number.isInteger(at) ? at : 0);
        }
        const list = blocks();
        const i = list.findIndex((block) => block === this || block.contains(this));
        if (i >= 0) return { left: 100, top: i * ROW_PX - stage.scrollTop, width: 700, height: ROW_PX };
        return plain.call(this);
    };
    return { stage, restore: () => (proto.getBoundingClientRect = plain) };
}

/** An `IntersectionObserver` a test drives: it says which cards came into view. */
function observers() {
    const made: any[] = [];
    const had = "IntersectionObserver" in g;
    g.IntersectionObserver = class {
        constructor(public callback: (entries: any[]) => void) {
            made.push(this);
        }
        observe() {}
        disconnect() {}
    };
    return {
        see: (...targets: DomNode[]) => made[made.length - 1].callback(targets.map((target) => ({ target, isIntersecting: true }))),
        undo: () => {
            if (!had) delete g.IntersectionObserver;
        },
    };
}

describe("the overview of a flowing book (#776)", () => {
    let undoText: () => void;
    let rec: AnimationRecord;
    let motion: () => void;
    let restore: (() => void) | null = null;
    let io: ReturnType<typeof observers>;
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
        io = observers();
    });
    afterEach(() => {
        endChapterTurn();
        restore?.();
        restore = null;
        rec.stop();
        motion();
        io.undo();
    });

    async function book(thoughts: Thought[] = [], settings: Record<string, any> = {}, chapter = 0) {
        const m = mountBook(thoughts, settings);
        await m.view.setState({ source: EPUB, chapter }, {} as never);
        await m.view.onOpen();
        await drawnChapter(m.content, chapter + 1);
        endChapterTurn();
        const laid = layOut(m);
        restore = laid.restore;
        return { ...m, stage: laid.stage };
    }

    describe("the door, one tap (AC-1, AC-2, FR-1–FR-3)", () => {
        it("is on the bar, labelled, and opens Contents on the overview with your chapter current", async () => {
            const { content } = await book([], {}, 1);
            const door = bar(content, "Overview");
            expect(door.hasClass(cls("reader-hidden"))).toBe(false);
            door.click();
            expect(panelOpen(content)).toBe(true);
            expect(content.byClass("reader-tab").map((el) => el.textContent)).toEqual(["Contents", "Overview", "Bookmarks", "Where you've been"]);
            expect(tab(content, "Overview").hasClass("is-active")).toBe(true);
            const current = cards(content).filter((card) => card.getAttribute("aria-current") !== null);
            expect(current).toHaveLength(1);
            expect(current[0].getAttribute("data-unit")).toBe("1");
            expect(current[0].getAttribute("aria-current")).toBe("step");
            // The door says it is open; Contents' own button is not the one pressed.
            expect(door.hasClass("is-active")).toBe(true);
            expect(bar(content, "Contents").hasClass("is-active")).toBe(false);
        });

        it("is not on a note reading's bar", async () => {
            const content = new DomNode();
            const app = {
                workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), iterateAllLeaves: () => undefined, setActiveLeaf: jest.fn(), trigger: jest.fn() },
                vault: { getAbstractFileByPath: (path: string) => file(path), cachedRead: async () => "A note." },
                metadataCache: { getFirstLinkpathDest: () => null, on: () => ({}), getFileCache: () => null },
            };
            const leaf = new WorkspaceLeaf(app, content) as unknown as WorkspaceLeaf;
            const view = new ReaderView(leaf, { settings: {}, saveSettings: jest.fn(async () => undefined) });
            await view.setState({ seed: "a.md", kind: "selection", paths: ["a.md", "b.md"] }, {} as never);
            await view.onOpen();
            await flush();
            expect(bar(content, "Overview").hasClass(cls("reader-hidden"))).toBe(true);
        });
    });

    describe("its cards (AC-4, AC-6, AC-7, FR-7, FR-9, D9–D11)", () => {
        it("is one card per chapter, named as Contents names it, each a preview of its start in your type", async () => {
            const { content } = await book();
            bar(content, "Overview").click();
            const list = cards(content);
            expect(list.map((card) => card.oneByClass("reader-overview-label").textContent)).toEqual(NAMES);
            expect(list.every((card) => card.hasClass(cls("reader-overview-card--chapter")))).toBe(true);
            io.see(list[2]);
            await settle(() => list[2].byClass("reader-overview-preview").length > 0 && list[2].oneByClass("reader-overview-preview").textContent.includes(sentence(2, 0)), 400, 3000);
            const preview = list[2].oneByClass("reader-overview-preview");
            // Its column is the reader's own body, inside the Reader: your face, size and theme.
            expect(preview.children[0].hasClass(cls("reader-body"))).toBe(true);
            // Only the start of the chapter is kept.
            expect(preview.byClass("reader-body")[0].find((el) => el.textContent === sentence(2, 19))).toBeUndefined();
        });

        it("draws the preview in the size you chose, next time it opens (walk steps 13, 26)", async () => {
            const { content, view } = await book();
            (view as any).savePrefs({ ...(view as any).prefs, size: "large" });
            bar(content, "Overview").click();
            const root = content.oneByClass("reader");
            expect(root.hasClass(cls("reader--size-large"))).toBe(true);
            const card = cards(content)[1];
            io.see(card);
            await settle(() => card.byClass("reader-overview-preview").length > 0, 400, 3000);
            let inside: DomNode | null = card;
            while (inside && inside !== root) inside = inside.parent;
            expect(inside).toBe(root);
        });

        it("shows your marks on their cards without a number: a tick in its colour, the pen, the ribbon", async () => {
            const thoughts = [
                thought({ at: 2, meaning: "question", quote: { exact: sentence(2, 3) } as any }),
                thought({ at: 2, meaning: "question", quote: { exact: sentence(2, 3) } as any, id: "dup" } as any),
                thought({ at: 2, ink: { drawing: "a.svg", side: "right", x: 0, line: 0, em: 1 } as any, quote: { exact: sentence(2, 4) } as any }),
            ];
            const { content } = await book(thoughts, { library: { [EPUB]: { size: 10, mtime: 20, chapters: 5, bookmarks: [{ chapter: 4, at: 1, offset: 0 }] } } });
            bar(content, "Overview").click();
            await settle(() => cards(content)[2].byClass("reader-overview-tick").length > 0);
            const list = cards(content);
            const ticks = list[2].byClass("reader-overview-tick");
            expect(ticks).toHaveLength(1);
            expect(ticks[0].hasClass(cls("reader-highlight--question"))).toBe(true);
            expect(list[2].byClass("reader-overview-pen")).toHaveLength(1);
            expect(list[4].byClass("reader-overview-ribbon")).toHaveLength(1);
            expect(list[3].byClass("reader-overview-marks")).toHaveLength(0);
            // No number anywhere on a card: its text, or what it says to a screen reader.
            for (const card of list) {
                expect(card.textContent).not.toMatch(/\d/);
                expect(card.getAttribute("aria-label") ?? "").not.toMatch(/\d/);
                for (const mark of [...card.byClass("reader-overview-ticks"), ...card.byClass("reader-overview-pen"), ...card.byClass("reader-overview-ribbon")]) {
                    expect(mark.getAttribute("role")).toBe("img");
                    expect(mark.getAttribute("aria-label")).toMatch(/^[^\d]+$/);
                }
            }
            expect(list[2].getAttribute("aria-label")).toContain("Highlighted");
            expect(list[2].getAttribute("aria-label")).toContain("Written in the margin");
            expect(list[4].getAttribute("aria-label")).toContain("Bookmarked");
        });

        it("fills a chapter's hairline to your place, fills one you read, leaves the rest empty — never a percentage", async () => {
            const { content, stage } = await book([], { library: { [EPUB]: { size: 10, mtime: 20, chapters: 5, read: [0] } } }, 1);
            stage.scrollTop = (stage.scrollHeight - stage.clientHeight) / 2;
            bar(content, "Overview").click();
            const fills = cards(content).map((card) => card.oneByClass("reader-overview-progress-fill").cssProps["--zf-card-progress"]);
            expect(fills).toEqual(["1", "0.5", "0", "0", "0"]);
            expect(content.oneByClass("reader-panel").textContent).not.toContain("%");
            expect(cards(content)[0].getAttribute("aria-label")).toContain("Read");
            expect(cards(content)[1].getAttribute("aria-label")).toContain("You are here");
        });

        it("keeps a chapter read to its end, in plugin data, as you leave it (P1)", async () => {
            const { content, stage, view, host } = await book();
            stage.scrollTop = stage.scrollHeight;
            stage.fire("scroll");
            (view as any).show(1);
            await drawnChapter(content, 2);
            expect(host.settings.library[EPUB].read).toEqual([0]);
        });
    });

    describe("going there and coming back (AC-8, AC-15, FR-12–FR-15, FR-20–FR-22, FR-26)", () => {
        it("opens as the camera pulling back: the page shrinks into your chapter's card, the cards settle in behind", async () => {
            const { content, stage } = await book([], {}, 1);
            const before = rec.animations.length;
            bar(content, "Overview").click();
            const shot = rec.animations.slice(before).find((a) => a.target.classes?.has(cls("motion-ghost")));
            expect(shot).toBeDefined();
            expect(shot!.options.duration).toBe(MOTION.cover);
            expect(shot!.keyframes[shot!.keyframes.length - 1].transform).toBe(flightTransform(boxOf(stage), CARD_BOX(1)));
            expect(shot!.target.classes.has(cls("reader-overview-ghost"))).toBe(true);
            expect(content.oneByClass("reader-overview").hasClass(cls("reader-overview--arriving"))).toBe(true);
            for (const frame of shot!.keyframes) for (const key of Object.keys(frame)) expect(["transform", "opacity", "offset"]).toContain(key);
        });

        it("lands a card on its chapter's start with no chapter turn on top, leaves a place on the trail, and closes", async () => {
            const { content, stage } = await book();
            bar(content, "Overview").click();
            const before = rec.animations.length;
            cards(content)[3].click();
            await drawnChapter(content, 4);
            const flight = rec.animations.slice(before).find((a) => a.target.classes?.has(cls("motion-ghost")));
            expect(flight!.keyframes[flight!.keyframes.length - 1].transform).toBe(flightTransform(CARD_BOX(3), boxOf(stage)));
            expect(content.byClass("reader-turn-sheet")).toHaveLength(0);
            expect(stage.scrollTop).toBe(0);
            await settle(() => !panelOpen(content));
            bar(content, "Contents").click();
            tab(content, "Where you've been").click();
            expect(content.byClass("reader-trail-row")).toHaveLength(1);
        });

        it("lands the chapter you are in on your place, never its top", async () => {
            const { content, stage } = await book([], {}, 1);
            stage.scrollTop = 1400;
            bar(content, "Overview").click();
            const before = rec.animations.length;
            cards(content)[1].click();
            expect(count(content)).toBe("Chapter 2 / 5");
            expect(stage.scrollTop).toBe(1400);
            // What grows from the card is the page where you are, never the chapter's start.
            const flight = rec.animations.slice(before).find((a) => a.target.classes?.has(cls("motion-ghost")));
            expect(flight!.target.byClass("reader-overview-ghost-page")).toHaveLength(1);
            expect(flight!.keyframes[0].transform).toBe(flightTransform(boxOf(stage), CARD_BOX(1)));
            await settle(() => !panelOpen(content));
        });

        it("leaves without a pick as the same shot backwards — Escape, or the door again — the place and the trail untouched", async () => {
            const { content, stage } = await book([], {}, 1);
            stage.scrollTop = 600;
            bar(content, "Overview").click();
            const before = rec.animations.length;
            press(content as never, "Escape");
            const back = rec.animations.slice(before).find((a) => a.target.classes?.has(cls("motion-ghost")));
            // The page as you left it, drawn at its own size, grows out of its card: opening, backwards.
            expect(back!.target.classes.has(cls("reader-overview-ghost"))).toBe(true);
            expect(back!.target.byClass("reader-overview-ghost-page")).toHaveLength(1);
            expect(back!.keyframes[0].transform).toBe(flightTransform(boxOf(stage), CARD_BOX(1)));
            expect(back!.keyframes[back!.keyframes.length - 1].transform).toBe("translate(0px, 0px) scale(1, 1)");
            await settle(() => !panelOpen(content));
            expect(stage.scrollTop).toBe(600);
            expect(count(content)).toBe("Chapter 2 / 5");
            bar(content, "Overview").click();
            expect(panelOpen(content)).toBe(true);
            bar(content, "Overview").click();
            await settle(() => !panelOpen(content));
            bar(content, "Contents").click();
            tab(content, "Where you've been").click();
            expect(content.byClass("reader-trail-row")).toHaveLength(0);
        });

        it("jumps a shot to its end on any input, and a second pick ends the first", async () => {
            const { content, stage } = await book();
            bar(content, "Overview").click();
            const opening = rec.animations.find((a) => a.target.classes?.has(cls("motion-ghost"))) as FakeAnimation;
            expect(opening.playState).toBe("running");
            stage.fire("pointerdown", { pointerType: "mouse", pointerId: 1, clientX: 5, clientY: 5, timeStamp: 1, target: stage, button: 0 });
            expect(opening.playState).toBe("finished");
        });

        it("is instant under reduced motion: no ghost, no fade, the place still continuous", async () => {
            motion();
            motion = reducedMotion(true);
            const { content } = await book();
            const before = rec.animations.length;
            bar(content, "Overview").click();
            io.see(cards(content)[0]);
            await settle(() => cards(content)[0].byClass("reader-overview-preview").length > 0, 400, 3000);
            expect(content.byClass("reader-overview-picture--drawn")).toHaveLength(0);
            cards(content)[2].click();
            await drawnChapter(content, 3);
            expect(rec.animations.slice(before).filter((a) => a.target.classes?.has(cls("motion-ghost")))).toHaveLength(0);
        });
    });

    describe("keyboard (AC-9, FR-16)", () => {
        it("reaches the current card with Tab, moves with the arrows, and goes there with Enter", async () => {
            const { content } = await book();
            bar(content, "Overview").click();
            const list = cards(content);
            expect(list.map((card) => card.getAttribute("tabindex"))).toEqual(["0", "-1", "-1", "-1", "-1"]);
            const grid = content.oneByClass("reader-overview");
            grid.fire("keydown", { key: "ArrowRight", target: list[0], preventDefault: () => undefined });
            expect(list.map((card) => card.getAttribute("tabindex"))).toEqual(["-1", "0", "-1", "-1", "-1"]);
            grid.fire("keydown", { key: "ArrowDown", target: list[1], preventDefault: () => undefined });
            grid.fire("keydown", { key: "Enter", target: list[2], preventDefault: () => undefined });
            await drawnChapter(content, 3);
        });

        it("names every mark and the current card in both languages", () => {
            for (const key of ["reader_overview", "reader_overview_current", "reader_overview_mark_highlight", "reader_overview_mark_ink", "reader_overview_mark_bookmark", "reader_overview_read", "reader_overview_reading"] as const) {
                expect(en[key]).toBeTruthy();
                expect((es as Record<string, string>)[key]).toBeTruthy();
                expect((es as Record<string, string>)[key]).not.toBe(en[key]);
            }
            expect((en as Record<string, string>).reader_pages_tab).toBeUndefined();
        });
    });

    describe("a pinch on the page (AC-14, FR-4, FR-23)", () => {
        const finger = (stage: any, type: string, id: number, x: number, y: number, t: number, pointerType = "touch") =>
            stage.fire(type, { pointerType, pointerId: id, isPrimary: id === 1, clientX: x, clientY: y, timeStamp: t, target: stage, button: 0 });

        it("shrinks the page under the fingers 1:1, and let go small it lands in its card", async () => {
            const { content, stage } = await book();
            finger(stage, "pointerdown", 1, 300, 300, 10);
            finger(stage, "pointerdown", 2, 700, 300, 12);
            finger(stage, "pointermove", 1, 400, 300, 30);
            finger(stage, "pointermove", 2, 600, 300, 32);
            expect(stage.hasClass(cls("reader-stage--pinching"))).toBe(true);
            expect(stage.cssProps["--zf-pinch-s"]).toBe("0.5");
            expect(stage.cssProps["--zf-pinch-x"]).toBe("500px");
            finger(stage, "pointermove", 1, 440, 300, 40);
            finger(stage, "pointermove", 2, 560, 300, 42);
            expect(stage.cssProps["--zf-pinch-s"]).toBe("0.3");
            finger(stage, "pointerup", 1, 440, 300, 60);
            finger(stage, "pointerup", 2, 560, 300, 62);
            expect(panelOpen(content)).toBe(true);
            expect(tab(content, "Overview").hasClass("is-active")).toBe(true);
            expect(stage.hasClass(cls("reader-stage--pinching"))).toBe(false);
        });

        it("follows the same pinch heard as touches, and takes it from the browser once it is inward", async () => {
            const { content, stage } = await book();
            const touches = (d: number) => ({ touches: [{ clientX: 500 - d, clientY: 300 }, { clientX: 500 + d, clientY: 300 }], cancelable: true, preventDefault: jest.fn() });
            stage.fire("touchstart", touches(200));
            const first = touches(196);
            stage.fire("touchmove", first);
            // Not yet a pinch: the browser keeps it.
            expect(first.preventDefault).not.toHaveBeenCalled();
            const inward = touches(80);
            stage.fire("touchmove", inward);
            expect(inward.preventDefault).toHaveBeenCalled();
            expect(stage.cssProps["--zf-pinch-s"]).toBe("0.4");
            stage.fire("touchend", { touches: [] });
            expect(panelOpen(content)).toBe(true);
        });

        it("never pinches the page while the ink palette is open: two fingers are ink's (P15)", async () => {
            const { content, stage, view } = await book();
            (view as any).ink.isOpen = () => true;
            const touches = (d: number) => ({ touches: [{ clientX: 500 - d, clientY: 300 }, { clientX: 500 + d, clientY: 300 }], cancelable: true, preventDefault: jest.fn() });
            stage.fire("touchstart", touches(200));
            stage.fire("touchmove", touches(60));
            stage.fire("touchend", { touches: [] });
            expect(stage.hasClass(cls("reader-stage--pinching"))).toBe(false);
            expect(panelOpen(content)).toBe(false);
        });

        it("springs back when let go short of it", async () => {
            const { content, stage } = await book();
            finger(stage, "pointerdown", 1, 300, 300, 10);
            finger(stage, "pointerdown", 2, 700, 300, 12);
            finger(stage, "pointermove", 1, 360, 300, 30);
            finger(stage, "pointermove", 2, 640, 300, 32);
            finger(stage, "pointerup", 1, 360, 300, 60);
            finger(stage, "pointerup", 2, 640, 300, 62);
            expect(panelOpen(content)).toBe(false);
            const spring = rec.animations.find((a) => a.target === stage && a.keyframes.some((k) => "scale" in k));
            expect(spring).toBeDefined();
        });

        it("never pinches with a mouse", async () => {
            const { content, stage } = await book();
            finger(stage, "pointerdown", 1, 300, 300, 10, "mouse");
            finger(stage, "pointerdown", 2, 700, 300, 12, "mouse");
            finger(stage, "pointermove", 1, 440, 300, 30, "mouse");
            finger(stage, "pointermove", 2, 560, 300, 32, "mouse");
            finger(stage, "pointerup", 1, 440, 300, 60, "mouse");
            finger(stage, "pointerup", 2, 560, 300, 62, "mouse");
            expect(stage.hasClass(cls("reader-stage--pinching"))).toBe(false);
            expect(panelOpen(content)).toBe(false);
        });

        it("still goes back along the trail with an even two-finger sweep, never a pinch", async () => {
            const { content, stage, view } = await book();
            (view as any).leaveTrail("contents");
            (view as any).show(3);
            await drawnChapter(content, 4);
            endChapterTurn();
            finger(stage, "pointerdown", 1, 300, 300, 10);
            finger(stage, "pointerdown", 2, 300, 500, 12);
            finger(stage, "pointermove", 1, 400, 300, 40);
            finger(stage, "pointermove", 2, 400, 500, 42);
            finger(stage, "pointerup", 1, 400, 300, 60);
            finger(stage, "pointerup", 2, 400, 500, 62);
            await drawnChapter(content, 1);
            expect(panelOpen(content)).toBe(false);
        });
    });

    it("writes nothing anywhere — opening, browsing, picking and leaving (AC-16, FR-19)", async () => {
        const { content, vault, store, app } = await book([thought({ at: 1, quote: { exact: sentence(1, 2) } as any })]);
        bar(content, "Overview").click();
        io.see(...cards(content));
        await flush(20);
        press(content as never, "Escape");
        bar(content, "Overview").click();
        cards(content)[2].click();
        await drawnChapter(content, 3);
        for (const spy of [vault.modify, vault.modifyBinary, vault.create, vault.createBinary, vault.process, store.write, store.save, store.discard, app.fileManager.processFrontMatter, app.fileManager.renameFile]) {
            expect(spy).not.toHaveBeenCalled();
        }
    });
});

describe("the overview of a paper, in both views (#776 AC-1, AC-5, FR-6)", () => {
    const proto = DomNode.prototype as any;
    let original: any;
    beforeAll(() => {
        original = proto.getBoundingClientRect;
        proto.getContext = function () {
            return { drawImage: () => undefined };
        };
    });
    afterAll(() => {
        proto.getBoundingClientRect = original;
        delete proto.getContext;
        __setPdfJs(null);
    });
    beforeEach(() => resetReaderWorkspace());

    async function paper(layout?: "page") {
        const pages: FakePage[] = Array.from({ length: 6 }, (_, i) => ({ runs: prose([`Page ${i + 1} says something about consistency.`]) }));
        const fake = makePdfJs({ pages, info: { Title: "A note on consistency" }, labels: null });
        __setPdfJs(fake.lib);
        const pdf = file(PDF);
        const vault = {
            getAbstractFileByPath: (path: string) => (path === pdf.path ? pdf : null),
            readBinary: async () => new ArrayBuffer(4),
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
        const leaf = new WorkspaceLeaf(app, content) as unknown as WorkspaceLeaf;
        const view = new ReaderView(leaf, { settings: { readingMotion: { chapter: "stack" } }, saveSettings: jest.fn(async () => undefined) }, { store: { folder: () => "Lab", highlightsAbout: jest.fn(async () => []) } as any });
        await view.setState({ source: PDF, chapter: 0, ...(layout ? { layout } : {}) }, {} as never);
        await view.onOpen();
        await settle(() => content.byClass("reader-next").length > 0);
        await flush();
        return { view, content, vault };
    }

    it("is one tap from the bar in the reading view and in Page view, on the page you are on", async () => {
        for (const layout of [undefined, "page" as const]) {
            const { content, view } = await paper(layout);
            const door = bar(content, "Overview");
            expect(door.hasClass(cls("reader-hidden"))).toBe(false);
            door.click();
            expect(tab(content, "Overview").hasClass("is-active")).toBe(true);
            const list = cards(content);
            expect(list).toHaveLength(6);
            expect(list.filter((card) => card.getAttribute("aria-current") !== null)).toEqual([list[(view as any).index]]);
            expect(list[(view as any).index].getAttribute("aria-current")).toBe("page");
            expect(list.every((card) => card.byClass("reader-overview-progress").length === 0)).toBe(true);
            expect((view as any).sourceView).toBe(layout === "page" ? "page" : "reading");
            resetReaderWorkspace();
        }
    });
});

describe("paper, then picture (#776 AC-10, FR-10, FR-11, FR-17, FR-24)", () => {
    const g2 = globalThis as any;
    let seen: ((entries: any[]) => void) | null = null;
    let had = false;
    beforeEach(() => {
        had = "IntersectionObserver" in g2;
        g2.IntersectionObserver = class {
            constructor(callback: (entries: any[]) => void) {
                seen = callback;
            }
            observe() {}
            disconnect() {}
        };
    });
    afterEach(() => {
        if (!had) delete g2.IntersectionObserver;
        seen = null;
    });

    function grid(draw: OverviewOptions["draw"], limit = 10) {
        const list = new DomNode();
        const scope = new Component();
        scope.load();
        const units = Array.from({ length: 6 }, (_, index) => ({ index, kind: "page" as const, label: `p. ${index + 1}` }));
        const overview = renderOverview(
            list as unknown as HTMLElement,
            { units, current: 0, ratio: () => 1.3, draw, marks: () => ({ ticks: [], pen: false, ribbon: false }), progress: () => null, onPick: jest.fn(), limit, fade: true },
            scope
        );
        const cardsOf = () => list.byClass("reader-overview-card");
        const see = (...indices: number[]) => seen?.(indices.map((i) => ({ target: cardsOf()[i], isIntersecting: true })));
        const leave = (...indices: number[]) => seen?.(indices.map((i) => ({ target: cardsOf()[i], isIntersecting: false })));
        return { list, overview, cardsOf, see, leave };
    }

    it("waits as a sheet of its shape with its label, never a spinner", () => {
        const { cardsOf, see } = grid(() => () => undefined);
        see(0, 1);
        const card = cardsOf()[0];
        expect(card.oneByClass("reader-overview-sheet").cssProps["--zf-card-ratio"]).toBe("1.3");
        expect(card.oneByClass("reader-overview-label").textContent).toBe("p. 1");
        expect(card.byClass("reader-overview-picture--drawn")).toHaveLength(0);
    });

    it("keeps the sheet of a card that cannot be drawn, says so once in the log and never in a Notice, and draws the others", () => {
        const warn = jest.spyOn(log, "warn").mockImplementation(() => undefined);
        try {
            const { cardsOf, see } = grid((index, picture, _w, done, fail) => {
                if (index < 2) {
                    fail(new Error("broken"));
                    return () => undefined;
                }
                picture.createEl("canvas");
                done();
                return () => undefined;
            });
            see(0, 1, 2);
            expect(warn).toHaveBeenCalledTimes(1);
            expect(cardsOf()[0].byClass("reader-overview-picture")).toHaveLength(0);
            expect(cardsOf()[0].oneByClass("reader-overview-label").textContent).toBe("p. 1");
            expect(cardsOf()[2].byClass("reader-overview-picture--drawn")).toHaveLength(1);
        } finally {
            warn.mockRestore();
        }
    });

    it("fades a first drawing in once; drawn again after it was let go, it simply is", () => {
        const { cardsOf, see, leave, overview } = grid((_i, picture, _w, done) => {
            picture.createEl("canvas");
            done();
            return () => undefined;
        }, 2);
        see(0, 1, 2);
        // Every card in view is kept, past the cap: a sheet you look at never goes blank.
        expect(overview.held().sort()).toEqual([0, 1, 2]);
        leave(0);
        see(3);
        // Past the cap of two, the farthest from what is in view, and out of it, is let go.
        expect(overview.held().sort()).toEqual([1, 2, 3]);
        leave(1);
        see(4);
        expect(overview.held().sort()).toEqual([2, 3, 4]);
        expect(cardsOf()[0].byClass("reader-overview-picture")).toHaveLength(0);
        leave(2, 3, 4);
        see(0);
        expect(cardsOf()[0].byClass("reader-overview-picture")).toHaveLength(1);
        expect(cardsOf()[0].byClass("reader-overview-picture--drawn")).toHaveLength(0);
    });

    it("lets a released canvas's pixels go", () => {
        const canvases: any[] = [];
        const { see, leave } = grid((_i, picture, _w, done) => {
            const canvas = picture.createEl("canvas") as any;
            canvas.width = 192;
            canvas.height = 248;
            canvases.push(canvas);
            done();
            return () => undefined;
        }, 1);
        see(0);
        leave(0);
        see(1);
        expect(canvases[0].width).toBe(0);
        expect(canvases[1].width).toBe(192);
    });
});
