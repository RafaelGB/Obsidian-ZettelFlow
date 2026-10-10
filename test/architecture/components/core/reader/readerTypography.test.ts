/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeAll, afterAll, beforeEach, afterEach } from "@jest/globals";
import { MarkdownRenderer, TFile, WorkspaceLeaf, __setPdfJs } from "obsidian";
import { DomNode, flush, installBrowserGlobals, settle } from "../../../../support/dashboardDom";
import { recordAnimations, reducedMotion, type AnimationRecord } from "../../../../support/motionDom";
import { makeEpub } from "../../../../support/zipFixture";
import { makePdfJs, prose } from "../../../../support/fakePdf";
import { parseXml } from "../../../../support/miniXml";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import { resetReaderWorkspace } from "architecture/components/core/reader/openReader";
import { MOTION } from "architecture/components/core/reader/readerMotion";
import { scrollTopFor } from "architecture/components/core/reader/readerPages";
import * as settleModule from "architecture/components/core/reader/readerSettle";
import type { HighlightStore } from "architecture/components/core/reader/readerHighlights";

/**
 * **Typography you can tune** (#757, epic #739): the rows of the Type panel, the language the column
 * declares, and the line you were reading kept through every change.
 */

const g = globalThis as any;
const proto = DomNode.prototype as any;

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.name = path.split("/").pop() ?? path;
    f.extension = path.split(".").pop() ?? "";
    (f as any).stat = { size: 10, mtime: 20, ctime: 1 };
    return f;
}

const NIEBLA = makeEpub({
    title: "Niebla",
    author: "Miguel de Unamuno",
    language: "es",
    chapters: [
        { id: "c1", href: "text/ch1.xhtml", title: "I", body: "<p>Al aparecer Augusto a la puerta de su casa extendió el brazo derecho.</p><p>Una representación.</p>" },
        { id: "c2", href: "text/ch2.xhtml", title: "II", body: "<p>Una cançó.</p>", lang: "ca" },
    ],
});

const STORE: HighlightStore = {
    folder: () => "Lab",
    highlightsAbout: jest.fn(async () => []),
    write: jest.fn(async () => undefined),
    save: jest.fn(async () => undefined),
    discard: jest.fn(async () => undefined),
    restore: jest.fn(async () => undefined),
};

function mount(files: Record<string, Uint8Array | string>, prefs?: Record<string, unknown>) {
    const app = {
        workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), iterateAllLeaves: () => undefined, setActiveLeaf: jest.fn(), trigger: jest.fn() },
        vault: {
            getAbstractFileByPath: (path: string) => (files[path] !== undefined ? file(path) : null),
            readBinary: async (f: TFile) => {
                const bytes = files[f.path] as Uint8Array;
                return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
            },
            cachedRead: async (f: TFile) => String(files[f.path]),
        },
        metadataCache: { getFirstLinkpathDest: () => null, on: () => ({}) },
    };
    const content = new DomNode();
    const leaf = new WorkspaceLeaf(app, content) as unknown as WorkspaceLeaf & { detach: jest.Mock };
    leaf.detach = jest.fn();
    const plugin = { settings: { readingMotion: { chapter: "stack" }, ...(prefs ? { readerPrefs: prefs } : {}) } as Record<string, any>, saveSettings: jest.fn(async () => undefined) };
    const view = new ReaderView(leaf, plugin, { store: STORE });
    return { view, plugin, content };
}

async function openSource(path: string, files: Record<string, Uint8Array | string>, chapter = 0, prefs?: Record<string, unknown>) {
    const m = mount(files, prefs);
    await m.view.setState({ source: path, chapter }, {} as never);
    await m.view.onOpen();
    await settle(() => m.content.byClass("reader-next").length > 0 || m.content.byClass("reader-missing").length > 0);
    return m;
}

async function openNotes(prefs?: Record<string, unknown>) {
    const body = Array.from({ length: 6 }, (_, i) => `Paragraph ${i} of the chapter.`).join("\n\n");
    const m = mount({ "a.md": body, "b.md": body }, prefs);
    await m.view.setState({ seed: "a.md", kind: "selection", paths: ["a.md", "b.md"] }, {} as never);
    await m.view.onOpen();
    await flush();
    return m;
}

const typeButton = (content: DomNode) => content.byClass("reader-bar-button").find((b) => b.getAttribute("aria-label") === "Type")!;
/** An answer in a row: `Large` is a size and a margin, so the row says which. */
const option = (content: DomNode, label: string, row?: string) => {
    const scope = row ? content.byClass("reader-type-row").find((r) => r.oneByClass("reader-type-label").textContent === row)! : content;
    return scope.byClass("reader-type-option").find((b) => b.textContent === label)!;
};
const hint = (content: DomNode) => content.byClass("reader-type-hint").map((el) => el.textContent);

describe("typography you can tune (#757)", () => {
    let rec: AnimationRecord;
    let motion: () => void;
    beforeAll(() => {
        g.DOMParser = class {
            parseFromString(text: string) {
                return { ...parseXml(text), getElementsByTagName: () => [] };
            }
        };
        proto.appendText = function (this: DomNode, text: string) {
            this.createSpan({ text });
        };
        g.URL.createObjectURL = () => "blob:1";
        g.URL.revokeObjectURL = () => undefined;
    });
    afterAll(() => {
        delete g.DOMParser;
        delete proto.appendText;
        __setPdfJs(null);
    });
    beforeEach(() => {
        installBrowserGlobals();
        g.addEventListener ??= () => undefined;
        g.removeEventListener ??= () => undefined;
        resetReaderWorkspace();
        MarkdownRenderer.calls = [];
        rec = recordAnimations();
        motion = reducedMotion(false);
    });
    afterEach(() => {
        rec.stop();
        motion();
        jest.restoreAllMocks();
    });

    describe("the column says what language it is in (AC-4, FR-6)", () => {
        it("declares a Spanish book's language, and a chapter's own over the book's", async () => {
            const book = await openSource("Books/niebla.epub", { "Books/niebla.epub": NIEBLA });
            expect(book.content.oneByClass("reader-body").getAttribute("lang")).toBe("es");
            const chapter = await openSource("Books/niebla.epub", { "Books/niebla.epub": NIEBLA }, 1);
            expect(chapter.content.oneByClass("reader-body").getAttribute("lang")).toBe("ca");
        });

        it("declares a PDF's language when it has one, and nothing when it has none", async () => {
            const pages = [{ runs: prose(["Die Sprache des Dokuments ist Deutsch, und sie wird erklärt."]) }];
            __setPdfJs(makePdfJs({ pages, info: { Title: "Ein Aufsatz", Language: "de-DE" } }).lib);
            const declared = await openSource("Papers/a.pdf", { "Papers/a.pdf": new Uint8Array(4) });
            expect(declared.content.oneByClass("reader-body").getAttribute("lang")).toBe("de-DE");
            __setPdfJs(makePdfJs({ pages, info: { Title: "Ein Aufsatz" } }).lib);
            const silent = await openSource("Papers/a.pdf", { "Papers/a.pdf": new Uint8Array(4) });
            expect(silent.content.oneByClass("reader-body").getAttribute("lang")).toBeNull();
        });

        it("leaves a note reading's language to Obsidian, as before", async () => {
            const { content } = await openNotes();
            expect(content.oneByClass("reader-body").getAttribute("lang")).toBeNull();
        });
    });

    describe("one panel, in order (AC-5, FR-10)", () => {
        it("reads Layout, Look, Font, Size, Line spacing, Width, Margins, then Justify, Focus mode and the time left", async () => {
            const { content } = await openNotes();
            typeButton(content).click();
            expect(content.byClass("reader-type-row").map((row) => row.oneByClass("reader-type-label").textContent)).toEqual([
                "Layout",
                "Look",
                "Font",
                "Size",
                "Line spacing",
                "Width",
                "Margins",
            ]);
            expect(content.byClass("reader-focus-toggle").map((b) => b.textContent)).toEqual(["Justify", "Focus mode", "Time left"]);
            const active = content.byClass("reader-type-option").filter((b) => b.hasClass("is-active")).map((b) => b.textContent);
            expect(active).toEqual(["Scroll", "Your theme", "Sans", "Medium", "Normal", "Medium", "Medium", "Time left"]);
        });

        it("saves each pick with the other preferences, and the page wears it at once", async () => {
            const { content, plugin } = await openNotes();
            const root = content.oneByClass("reader");
            typeButton(content).click();
            option(content, "Airy").click();
            expect(plugin.settings.readerPrefs.spacing).toBe("airy");
            expect(plugin.saveSettings).toHaveBeenCalled();
            expect(root.hasClass("zettelkasten-flow__reader--spacing-airy")).toBe(true);
            expect(option(content, "Airy").hasClass("is-active")).toBe(true);
            option(content, "Wide", "Width").click();
            expect(root.hasClass("zettelkasten-flow__reader--width-wide")).toBe(true);
            option(content, "Large", "Margins").click();
            expect(plugin.settings.readerPrefs).toMatchObject({ spacing: "airy", width: "wide", margins: "large", size: "medium" });
            expect(root.hasClass("zettelkasten-flow__reader--margins-large")).toBe(true);
            option(content, "Justify").click();
            expect(plugin.settings.readerPrefs.justify).toBe(true);
            expect(root.hasClass("zettelkasten-flow__reader--justify")).toBe(true);
        });

        it("names the language the words are hyphenated in, only while Justify is on (FR-7)", async () => {
            const book = await openSource("Books/niebla.epub", { "Books/niebla.epub": NIEBLA });
            typeButton(book.content).click();
            expect(hint(book.content)).toEqual([]);
            option(book.content, "Justify").click();
            expect(hint(book.content)).toEqual(["Hyphenated as Spanish"]);
            option(book.content, "Justify").click();
            expect(hint(book.content)).toEqual([]);
            // A note reading is hyphenated in Obsidian's language.
            const notes = await openNotes({ justify: true });
            typeButton(notes.content).click();
            expect(hint(notes.content)).toEqual(["Hyphenated as English"]);
        });

        it("says, in a PDF's Page view, that these rows shape the reading view (the empty state)", async () => {
            const pages = [{ runs: prose(["A page of a paper, drawn as it was printed, with its figures in place."]) }];
            __setPdfJs(makePdfJs({ pages, info: { Title: "A paper" } }).lib);
            const m = mount({ "Papers/a.pdf": new Uint8Array(4) });
            await m.view.setState({ source: "Papers/a.pdf", chapter: 0, layout: "page" }, {} as never);
            await m.view.onOpen();
            await settle(() => m.content.byClass("reader-next").length > 0);
            typeButton(m.content).click();
            expect(m.content.byClass("reader-type-note").map((el) => el.textContent)).toEqual([
                "Page view draws the page as printed; these shape the reading view.",
            ]);
        });
    });

    describe("the text changes under your eyes (AC-6, FR-13, FR-16)", () => {
        it("keeps the line you were reading in Scroll, and settles the lines around it, faint and quick", async () => {
            const { content, view } = await openNotes();
            const stage = content.oneByClass("reader-stage") as any;
            const page = content.oneByClass("reader-page") as any;
            const empty = jest.spyOn(page, "empty");
            const pager = (view as any).pager;
            const blocks = pager.blocks() as DomNode[];
            expect(blocks.length).toBeGreaterThan(2);
            // The second paragraph is the first line on screen; after the change, it is 140 px further down.
            const anchor = blocks[1] as any;
            jest.spyOn(pager, "firstVisible").mockReturnValue(anchor);
            stage.scrollTop = 200;
            stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 700 });
            const settleSpy = jest.spyOn(settleModule, "settleAround");
            typeButton(content).click();
            anchor.getBoundingClientRect = () => ({ left: 0, top: 140, width: 600, height: 40 });
            option(content, "Airy").click();
            expect(stage.scrollTop).toBe(scrollTopFor(140, 0, 200));
            expect(settleSpy).toHaveBeenCalledTimes(1);
            const [keep, , options] = settleSpy.mock.calls[0];
            expect(keep).toBe(anchor);
            expect(options).toMatchObject({ duration: MOTION.fast, fromOpacity: 0.85 });
            // Opacity alone, and the line you were reading never moves.
            const settled = rec.animations.filter((a) => !a.target.hasClass?.("zettelkasten-flow__reader-type-marker"));
            expect(settled.length).toBeGreaterThan(0);
            expect(settled.some((a) => a.target === anchor)).toBe(false);
            for (const a of settled) expect(a.options.duration).toBe(MOTION.fast);
            expect(empty).not.toHaveBeenCalled();
        });

        it("keeps the page holding the line in Page", async () => {
            const { content, view } = await openNotes({ layout: "page" });
            const pager = (view as any).pager;
            const anchor = pager.blocks()[2];
            jest.spyOn(pager, "firstVisible").mockReturnValue(anchor);
            const relayout = jest.spyOn(pager, "relayout");
            typeButton(content).click();
            option(content, "Narrow", "Width").click();
            expect(relayout).toHaveBeenCalledWith({ anchor });
        });

        it("is instant under reduced motion, and the line is still kept", async () => {
            motion();
            motion = reducedMotion(true);
            const { content, view } = await openNotes();
            const stage = content.oneByClass("reader-stage") as any;
            const pager = (view as any).pager;
            const anchor = pager.blocks()[1] as any;
            jest.spyOn(pager, "firstVisible").mockReturnValue(anchor);
            stage.scrollTop = 50;
            stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 700 });
            typeButton(content).click();
            rec.animations.length = 0;
            anchor.getBoundingClientRect = () => ({ left: 0, top: 90, width: 600, height: 40 });
            option(content, "Tight").click();
            expect(stage.scrollTop).toBe(scrollTopFor(90, 0, 50));
            expect(rec.animations).toHaveLength(0);
        });
    });
});
