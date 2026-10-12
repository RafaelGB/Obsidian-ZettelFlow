/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeAll, afterAll, beforeEach, afterEach } from "@jest/globals";
import { TFile, WorkspaceLeaf } from "obsidian";
import { DomNode, settle } from "../../../../support/dashboardDom";
import { parseXml } from "../../../../support/miniXml";
import { makeEpub } from "../../../../support/zipFixture";
import { withTextNodes } from "../../../../support/domText";
import { recordAnimations, reducedMotion, type AnimationRecord, type FakeAnimation } from "../../../../support/motionDom";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import { resetReaderWorkspace } from "architecture/components/core/reader/openReader";
import { endChapterTurn } from "architecture/components/core/reader/readerTurn";
import { chapterText } from "architecture/components/core/reader/readerMarks";
import type { HighlightStore, SelectionInfo } from "architecture/components/core/reader/readerHighlights";
import { bufferedWrites } from "architecture/plugin/writes/recordVaultWrite";
import { MOTION } from "architecture/components/core/reader/readerMotion";
import type { Thought } from "application/thinking/thought";

/**
 * **Layers, and read it clean** over a mounted Reader (#758): the Layers panel, where new marks go,
 * a layer hidden, *Hide my annotations* and *Reveal my thinking* — and that none of it writes, and
 * that only the ink moves, never the words.
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

const BOOK = makeEpub({
    title: "Middlemarch",
    chapters: [1, 2].map((n) => ({
        id: `c${n}`,
        href: `text/ch${n}.xhtml`,
        title: ["Prelude", "Miss Brooke"][n - 1],
        body: Array.from({ length: 6 }, (_, i) => `<p>Chapter ${n} paragraph ${i} goes on for a while.</p>`).join(""),
    })),
});

const STAGE = { left: 0, top: 0, width: 1000, height: 700 };

function mark(id: string, at: number, paragraph: number, over: Partial<Thought> = {}): Thought {
    return {
        id,
        at,
        text: "",
        links: [],
        about: PATH,
        quote: { exact: `Chapter 1 paragraph ${paragraph}`, prefix: "", suffix: "" },
        locator: { at: 0, label: "Chapter 1", chapter: "text/ch1.xhtml" },
        meaning: "idea",
        ...over,
    } as Thought;
}

/** Three highlights made in a known order — second, first, third on the page — one with a note; a page note on research. */
const MARKS = (): Thought[] => [
    mark("first", 10, 1),
    mark("third", 30, 2, { text: "a note in the margin" }),
    mark("second", 20, 3),
    { id: "page", at: 5, text: "a page note", links: [], about: PATH, locator: { at: 0, label: "Chapter 1" }, layer: "research" } as Thought,
];

let now = 1_000_000;

function mount(thoughts: Thought[], host = { settings: { readingMotion: { chapter: "leaf" }, readerPrefs: { font: "sans", size: "medium", theme: "auto" } } as Record<string, any>, saveSettings: jest.fn(async () => undefined) }) {
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
    let made = 0;
    const store: HighlightStore = {
        folder: () => "Lab",
        highlightsAbout: jest.fn(async (path: string) => thoughts.filter((t) => t.about === path)),
        write: jest.fn(async (text: string, options: any) => {
            const thought = { id: `new${++made}`, at: now, text, links: [], ...options } as Thought;
            thoughts.push(thought);
            return thought;
        }),
        save: jest.fn(async () => undefined),
        discard: jest.fn(async () => undefined),
        restore: jest.fn(async () => undefined),
    };
    let selection: SelectionInfo | null = null;
    const view = new ReaderView(leaf, host, { store, toNote: jest.fn(), selection: () => selection, headingAt: () => undefined });
    const select = (words: string) => {
        const body = (view as any).highlights.body;
        const start = chapterText(body).indexOf(words);
        selection = { start, end: start + words.length, rect: { left: 10, top: 20, width: 30 }, clear: () => (selection = null) };
    };
    return { view, content, host, store, vault, select };
}

function layOut(content: DomNode) {
    const stage = content.oneByClass("reader-stage") as any;
    stage.clientHeight = STAGE.height;
    const proto = DomNode.prototype as any;
    const plain = proto.getBoundingClientRect;
    const hadRects = Object.prototype.hasOwnProperty.call(proto, "getClientRects");
    proto.getBoundingClientRect = function (this: DomNode) {
        if (this === stage) return { ...STAGE };
        return { left: 100, top: 40, width: 600, height: 20 };
    };
    // A mark is one line box on screen; anything else is a block.
    proto.getClientRects = function (this: DomNode) {
        return this.tag === "mark" ? [{ left: 120, top: 60, width: 80, height: 18 }] : [];
    };
    return {
        stage,
        restore: () => {
            proto.getBoundingClientRect = plain;
            if (!hadRects) delete proto.getClientRects;
        },
    };
}

const livePage = (content: DomNode) => content.byClass("reader-stage")[0]?.children.find((child) => child.hasClass(cls("reader-page")));
const AWAY = cls("reader-highlight--away");
const marksOn = (content: DomNode, id: string) => livePage(content)!.findAll((el) => el.tag === "mark" && el.getAttribute("data-hl") === id);
const awayOnPage = (content: DomNode) =>
    [...new Set(livePage(content)!.findAll((el) => el.tag === "mark" && el.hasClass(AWAY)).map((el) => el.getAttribute("data-hl")))].sort();
const rowsAway = (content: DomNode) =>
    content
        .oneByClass("reader-margin")
        .findAll((el) => el.hasClass(cls("reader-hl-item")) && el.hasClass(AWAY))
        .map((el) => el.getAttribute("data-hl") ?? el.getAttribute("data-note"))
        .sort();
const layersButton = (content: DomNode) => content.oneByClass("reader-bar").find((el) => el.tag === "button" && (el.getAttribute("aria-label") ?? "").startsWith("Layers"))!;
const panel = (content: DomNode) => content.oneByClass("reader-panel");
const lifts = (rec: AnimationRecord) => rec.animations.filter((a) => (a.target as DomNode).hasClass?.(cls("reader-ink-lift")));

describe("layers, and read it clean, over the Reader (#758)", () => {
    let undoText: () => void;
    let rec: AnimationRecord;
    let motion: () => void;
    let restore: (() => void) | null = null;
    let listeners: Map<string, ((event: unknown) => void)[]>;
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
        listeners = new Map();
        g.addEventListener = (name: string, fn: (event: unknown) => void) => listeners.set(name, [...(listeners.get(name) ?? []), fn]);
        g.removeEventListener = (name: string, fn: (event: unknown) => void) => listeners.set(name, (listeners.get(name) ?? []).filter((f) => f !== fn));
        g.getSelection = () => ({ isCollapsed: true, toString: () => "" });
        // The ghost a new highlight flies into the margin with is made unattached, as Obsidian's global does.
        g.createDiv = (options: unknown) => {
            const el = new DomNode().createDiv(options);
            el.remove();
            return el;
        };
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
        delete g.getSelection;
        delete g.createDiv;
        jest.restoreAllMocks();
    });

    async function open(thoughts: Thought[] = MARKS(), host?: Parameters<typeof mount>[1], drawn = (m: ReturnType<typeof mount>) => marksOn(m.content, "second").length > 0 && m.content.oneByClass("reader-margin").byClass("reader-hl-item").length >= 4) {
        const m = mount(thoughts, host);
        await m.view.setState({ source: PATH, chapter: 0 }, {} as never);
        await m.view.onOpen();
        await settle(() => (livePage(m.content)?.byClass("reader-next").length ?? 0) > 0);
        const laid = layOut(m.content);
        restore = laid.restore;
        await settle(() => drawn(m));
        return { ...m, ...laid };
    }

    function fire(name: string) {
        for (const fn of listeners.get(name) ?? []) fn({});
    }

    describe("the Layers panel (FR-3, FR-4, FR-5)", () => {
        it("lists the three layers with what each is for, their switches and where new marks go — and no number", async () => {
            const m = await open();
            layersButton(m.content).click();
            const host = panel(m.content);
            expect(host.oneByClass("reader-panel-title").textContent).toBe("Layers");
            const rows = host.byClass("reader-layer");
            expect(rows.map((row) => row.oneByClass("reader-layer-name").textContent)).toEqual(["Reading", "Reflection", "Research"]);
            expect(rows.map((row) => row.oneByClass("reader-layer-desc").textContent)).toEqual(["What you mark the first time", "What you write after", "Sources, contradictions, references"]);
            expect(rows.map((row) => row.byClass("checkbox-container")[0]?.getAttribute("aria-checked"))).toEqual(["true", "true", "true"]);
            // Reflection has nothing in this chapter: it is dimmed.
            expect(rows.map((row) => row.hasClass(cls("reader-layer--empty")))).toEqual([false, true, false]);
            const target = host.find((el) => el.getAttribute("data-zf-row") === "layer-target")!;
            expect(target.oneByClass("reader-type-label").textContent).toBe("New marks go to");
            expect(target.find((el) => el.hasClass("is-active"))?.getAttribute("data-zf-value")).toBe("reading");
            expect(host.find((el) => el.getAttribute("data-zf-clean") === "hide")?.textContent).toBe("Hide my annotations");
            // The manual steps' *no number*: nothing in the panel counts.
            for (const el of host.findAll(() => true)) expect(el.text ?? "").not.toMatch(/\d/);
        });

        it("puts the chosen layer's name beside the button, writes new marks there, and remembers it per source (AC-2)", async () => {
            const m = await open();
            layersButton(m.content).click();
            panel(m.content).find((el) => el.getAttribute("data-zf-value") === "reflection")!.click();
            const label = m.content.oneByClass("reader-bar-layer");
            expect(label.textContent).toBe("Reflection");
            expect(label.hasClass(cls("reader-hidden"))).toBe(false);
            expect(m.host.settings.readerLayers).toEqual({ [PATH]: { target: "reflection" } });
            expect(m.host.saveSettings).toHaveBeenCalled();
            // A fourth highlight lands on reflection.
            m.select("Chapter 1 paragraph 4");
            expect((m.view as any).highlights.highlightCurrent()).toBe(true);
            await settle(() => (m.store.write as jest.Mock).mock.calls.length > 0);
            expect((m.store.write as jest.Mock).mock.calls[0][1]).toEqual(expect.objectContaining({ layer: "reflection" }));
            // Reopened: the choice is still there.
            const again = mount(MARKS(), m.host as any);
            await again.view.setState({ source: PATH, chapter: 0 }, {} as never);
            await again.view.onOpen();
            await settle(() => again.content.byClass("reader-bar-layer")[0]?.textContent === "Reflection");
            expect(again.content.oneByClass("reader-bar-layer").textContent).toBe("Reflection");
        });

        it("hides a layer from the page, the margin and the page notes, and the button reads as active (AC-3, FR-5)", async () => {
            const m = await open();
            layersButton(m.content).click();
            const research = panel(m.content).byClass("reader-layer")[2].oneByClass("checkbox-container");
            research.click();
            rec.finishAll();
            expect(rowsAway(m.content)).toEqual(["page"]);
            expect(awayOnPage(m.content)).toEqual([]);
            expect(layersButton(m.content).hasClass("is-active")).toBe(true);
            expect(m.host.settings.readerLayers).toEqual({ [PATH]: { hidden: ["research"] } });
            const reading = panel(m.content).byClass("reader-layer")[0].oneByClass("checkbox-container");
            reading.click();
            rec.finishAll();
            expect(awayOnPage(m.content)).toEqual(["first", "second", "third"]);
            expect(rowsAway(m.content)).toEqual(["first", "page", "second", "third"]);
            // Closed, the button still says a layer is hidden.
            panel(m.content).oneByClass("reader-panel-close").click();
            rec.finishAll();
            await settle(() => !panel(m.content).hasClass(cls("reader-panel--open")));
            expect(layersButton(m.content).hasClass("is-active")).toBe(true);
            // A chapter drawn again keeps them hidden: reopened, the same.
            const again = mount(MARKS(), m.host as any);
            await again.view.setState({ source: PATH, chapter: 0 }, {} as never);
            await again.view.onOpen();
            await settle(() => marksOn(again.content, "second").length > 0 && awayOnPage(again.content).length === 3);
            expect(awayOnPage(again.content)).toEqual(["first", "second", "third"]);
        });

        it("changes a mark's layer from its menu, and it leaves the page when that layer is hidden (FR-6)", async () => {
            const m = await open();
            (m.view as any).layerView.hideLayer("research");
            marksOn(m.content, "first")[0].fire("click");
            const button = m.content.find((el) => el.hasClass(cls("reader-hl-layer")) && el.textContent === "Research")!;
            button.click();
            await settle(() => (m.store.save as jest.Mock).mock.calls.length > 0);
            await settle(() => awayOnPage(m.content).includes("first"));
            expect((m.store.save as jest.Mock).mock.calls[0][0]).toEqual(expect.objectContaining({ id: "first", layer: "research" }));
            expect(awayOnPage(m.content)).toEqual(["first"]);
        });
    });

    describe("read it clean (FR-8, FR-9, FR-10)", () => {
        it("hides every mark and shows the pill; a mark made while clean is shown; reveal brings them all back — and nothing is written (AC-6)", async () => {
            const m = await open();
            const writes = bufferedWrites().length;
            layersButton(m.content).click();
            panel(m.content).find((el) => el.getAttribute("data-zf-clean") === "hide")!.click();
            rec.finishAll();
            expect(awayOnPage(m.content)).toEqual(["first", "second", "third"]);
            expect(rowsAway(m.content)).toEqual(["first", "page", "second", "third"]);
            const pill = m.content.oneByClass("reader-clean-pill");
            expect(pill.hasClass(cls("reader-hidden"))).toBe(false);
            expect(pill.textContent).toBe("Reading clean·Reveal my thinking");
            // The panel's button turns to the way back.
            expect(panel(m.content).find((el) => el.getAttribute("data-zf-clean") === "reveal")?.textContent).toBe("Reveal my thinking");
            expect(m.store.save).not.toHaveBeenCalled();
            expect(m.store.write).not.toHaveBeenCalled();
            // A mark made now is shown.
            now += 1000;
            m.select("Chapter 1 paragraph 4");
            (m.view as any).highlights.highlightCurrent();
            await settle(() => marksOn(m.content, "new1").length > 0);
            expect(marksOn(m.content, "new1").every((el) => !el.hasClass(AWAY))).toBe(true);
            expect(awayOnPage(m.content)).toEqual(["first", "second", "third"]);
            pill.click();
            rec.finishAll();
            expect(awayOnPage(m.content)).toEqual([]);
            expect(rowsAway(m.content)).toEqual([]);
            expect(m.content.oneByClass("reader-clean-pill").hasClass(cls("reader-hidden"))).toBe(true);
            // Only the highlight you made was written: hiding and revealing wrote nothing.
            expect(m.store.write).toHaveBeenCalledTimes(1);
            expect(m.store.save).not.toHaveBeenCalled();
            expect(bufferedWrites().length).toBe(writes);
            for (const write of [m.vault.modify, m.vault.create, m.vault.process]) expect(write).not.toHaveBeenCalled();
        });

        it("in an empty chapter, has nothing to hide — and still says you are reading clean", async () => {
            const m = await open([mark("elsewhere", 1, 1, { locator: { at: 1, label: "Chapter 2" } })], undefined, (m) => (m.store.highlightsAbout as jest.Mock).mock.calls.length >= 2);
            await settle(() => false, 20, 0);
            layersButton(m.content).click();
            // Every layer is dimmed: nothing of any is in this chapter.
            expect(panel(m.content).byClass("reader-layer").map((row) => row.hasClass(cls("reader-layer--empty")))).toEqual([true, true, true]);
            panel(m.content).find((el) => el.getAttribute("data-zf-clean") === "hide")!.click();
            expect(m.content.oneByClass("reader-clean-pill").hasClass(cls("reader-hidden"))).toBe(false);
            expect(lifts(rec)).toEqual([]);
        });

        it("forgets reading clean when the book is opened again (FR-8)", async () => {
            const m = await open();
            (m.view as any).hideAnnotations();
            rec.finishAll();
            const again = mount(MARKS(), m.host as any);
            await again.view.setState({ source: PATH, chapter: 0 }, {} as never);
            await again.view.onOpen();
            await settle(() => marksOn(again.content, "second").length > 0);
            expect(awayOnPage(again.content)).toEqual([]);
            expect(again.content.oneByClass("reader-clean-pill").hasClass(cls("reader-hidden"))).toBe(true);
        });
    });

    describe("the ink moves, never the text (FR-13 – FR-17, AC-7)", () => {
        async function cleanPage() {
            const m = await open();
            (m.view as any).hideAnnotations();
            rec.finishAll();
            rec.animations.length = 0;
            return m;
        }

        it("reveals in the order you made them: one lifted ink per line box, opacity only, then the tint is back", async () => {
            const m = await cleanPage();
            m.content.oneByClass("reader-clean-pill").click();
            const ink = lifts(rec);
            // first (10), second (20), third (30): their delays follow, 350 ms apart.
            const byMark = ink.map((a) => ({ delay: (a.options as any).delay, duration: a.options.duration }));
            expect(byMark).toEqual([
                { delay: 0, duration: MOTION.base },
                { delay: 350, duration: MOTION.base },
                { delay: 700, duration: MOTION.base },
            ]);
            for (const a of ink) expect(a.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
            // Each lift is drawn where its mark is: the first under "first".
            const layers = m.stage.byClass("reader-ink-lifts");
            expect(layers.length).toBe(3);
            expect(m.stage.hasClass(cls("reader-stage--lifting"))).toBe(true);
            // Nothing else moves but the margin's rows — never the page, never a word.
            for (const a of rec.animations) {
                const target = a.target as DomNode;
                expect(target.hasClass(cls("reader-page"))).toBe(false);
                expect(target.tag).not.toBe("mark");
                expect(target.tag).not.toBe("#text");
                const keys = new Set(a.keyframes.flatMap((frame) => Object.keys(frame)));
                for (const key of keys) expect(["opacity", "transform"]).toContain(key);
            }
            const rows = rec.animations.filter((a) => (a.target as DomNode).hasClass(cls("reader-hl-item")));
            expect(rows.length).toBeGreaterThan(0);
            for (const row of rows) expect(row.keyframes[0]).toEqual({ opacity: 0, transform: "translateX(8px)" });
            // Mid-way the marks wait, their ink lifted.
            expect(awayOnPage(m.content)).toEqual(["first", "second", "third"]);
            rec.finishAll();
            expect(awayOnPage(m.content)).toEqual([]);
            expect(m.stage.byClass("reader-ink-lift")).toEqual([]);
            expect(m.stage.hasClass(cls("reader-stage--lifting"))).toBe(false);
        });

        it("hides in one quiet fade: every lift `fast`, all at 0 ms; the pill slides 8 px", async () => {
            const m = await open();
            (m.view as any).hideAnnotations();
            const ink = lifts(rec);
            expect(ink.length).toBe(3);
            for (const a of ink) {
                expect(a.options.duration).toBe(MOTION.fast);
                expect((a.options as any).delay).toBe(0);
                expect(a.keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }]);
            }
            const pill = rec.animations.find((a) => (a.target as DomNode).hasClass(cls("reader-clean-pill"))) as FakeAnimation;
            expect(pill.keyframes[0]).toEqual({ opacity: 0, transform: "translateX(-50%) translateY(-8px)" });
            // The words lost their tint in the same frame the lifts took it.
            expect(awayOnPage(m.content)).toEqual(["first", "second", "third"]);
        });

        it("completes at once on a key, a press or a wheel during the reveal (FR-14)", async () => {
            for (const input of ["keydown", "pointerdown", "wheel"]) {
                const m = await cleanPage();
                m.content.oneByClass("reader-clean-pill").click();
                expect(awayOnPage(m.content)).toEqual(["first", "second", "third"]);
                fire(input);
                expect(awayOnPage(m.content)).toEqual([]);
                expect(m.stage.byClass("reader-ink-lift")).toEqual([]);
                expect(listeners.get(input) ?? []).toEqual([]);
                restore?.();
                restore = null;
            }
        });

        it("never staggers while you are selecting: everything is simply back", async () => {
            const m = await cleanPage();
            g.getSelection = () => ({ isCollapsed: false, toString: () => "some words" });
            m.content.oneByClass("reader-clean-pill").click();
            expect(lifts(rec).every((a) => (a.options as any).delay === 0)).toBe(true);
        });

        it("fades one layer in and out `fast` (FR-16)", async () => {
            const m = await open();
            (m.view as any).showLayer("reading", false);
            expect(lifts(rec).map((a) => a.options.duration)).toEqual([MOTION.fast, MOTION.fast, MOTION.fast]);
            rec.finishAll();
            rec.animations.length = 0;
            (m.view as any).showLayer("reading", true);
            expect(lifts(rec).map((a) => [a.options.duration, (a.options as any).delay])).toEqual([[MOTION.fast, 0], [MOTION.fast, 0], [MOTION.fast, 0]]);
        });

        it("under reduced motion, every mark leaves and returns at once: no animation, no lift (FR-17)", async () => {
            motion();
            motion = reducedMotion(true);
            const m = await open();
            (m.view as any).hideAnnotations();
            expect(awayOnPage(m.content)).toEqual(["first", "second", "third"]);
            m.content.oneByClass("reader-clean-pill").click();
            expect(awayOnPage(m.content)).toEqual([]);
            expect(rec.animations.filter((a) => (a.target as DomNode).hasClass(cls("reader-ink-lift")) || (a.target as DomNode).hasClass(cls("reader-hl-item")))).toEqual([]);
            expect(m.stage.byClass("reader-ink-lift")).toEqual([]);
        });
    });
});
