/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeAll, afterAll, beforeEach, afterEach } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { TFile, WorkspaceLeaf } from "obsidian";
import { DomNode, installBrowserGlobals, settle } from "../../../../support/dashboardDom";
import { parseXml } from "../../../../support/miniXml";
import { press } from "../../../../support/readerKeys";
import { recordAnimations, reducedMotion, type AnimationRecord } from "../../../../support/motionDom";
import { installColumns, type Columns } from "../../../../support/readerColumns";
import { generateBook } from "../../../../perf/generateBook";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import { endChapterTurn } from "architecture/components/core/reader/readerTurn";
import { resetReaderWorkspace } from "architecture/components/core/reader/openReader";
import { clearSamples, sampleCount } from "architecture/monitoring/measure";
import type { HighlightStore } from "architecture/components/core/reader/readerHighlights";

const g = globalThis as any;
const proto = DomNode.prototype as any;
const BOOK = generateBook(7);

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.name = path.split("/").pop() ?? path;
    f.extension = path.split(".").pop() ?? "";
    (f as any).stat = { size: BOOK.bytes.length, mtime: 20, ctime: 1 };
    return f;
}

/** The Reader on the synthetic technical book, in *Page*, over the column model. */
function mount(read: () => Promise<ArrayBuffer>) {
    const book = file("Books/technical.epub");
    const writes = { create: jest.fn(), modify: jest.fn(), process: jest.fn() };
    const app = {
        workspace: { requestSaveLayout: jest.fn(), openLinkText: jest.fn(), iterateAllLeaves: () => undefined, setActiveLeaf: jest.fn(), trigger: jest.fn() },
        vault: { getAbstractFileByPath: (path: string) => (path === book.path ? book : null), readBinary: read, cachedRead: async () => "", ...writes },
        metadataCache: { getFirstLinkpathDest: () => null, on: () => ({}) },
    };
    const content = new DomNode();
    const leaf = new WorkspaceLeaf(app, content) as unknown as WorkspaceLeaf & { detach: jest.Mock };
    leaf.detach = jest.fn();
    const host = { settings: { readerPrefs: { layout: "page" }, readingMotion: { chapter: "stack" } } as Record<string, unknown>, saveSettings: jest.fn(async () => undefined) };
    const store: HighlightStore = {
        folder: () => "Lab",
        highlightsAbout: jest.fn(async () => []),
        write: jest.fn(async () => undefined),
        save: jest.fn(async () => undefined),
        discard: jest.fn(async () => undefined),
        restore: jest.fn(async () => undefined),
    };
    return { view: new ReaderView(leaf, host, { store }), content, writes };
}

const bytes = () => BOOK.bytes.buffer.slice(BOOK.bytes.byteOffset, BOOK.bytes.byteOffset + BOOK.bytes.byteLength) as ArrayBuffer;
const drawn = (content: DomNode) => content.byClass("reader-next").length > 0;

/**
 * The four reading moments are timed where they happen, in the view (#825 AC-6, AC-6c): the wiring
 * the Settings › Advanced rows read. The time itself is the budgets'; this proves the samples land.
 */
describe("the Reader times what a reader waits through (#825)", () => {
    let columns: Columns;
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
    });
    beforeEach(() => {
        installBrowserGlobals();
        g.addEventListener ??= () => undefined;
        g.removeEventListener ??= () => undefined;
        resetReaderWorkspace();
        columns = installColumns({ width: 1000, height: 700 });
        rec = recordAnimations();
        motion = reducedMotion(false);
        clearSamples();
    });
    afterEach(() => {
        endChapterTurn();
        rec.stop();
        motion();
        columns.uninstall();
    });

    async function open(chapter: number) {
        const m = mount(async () => bytes());
        await m.view.setState({ source: "Books/technical.epub", chapter }, {} as never);
        await m.view.onOpen();
        await settle(() => drawn(m.content));
        return m;
    }

    it("times a chapter opened, a page turned, the type changed and a chapter turned — and writes nothing", async () => {
        const { view, content, writes } = await open(1);
        expect(sampleCount("reader.chapter.open")).toBe(1);

        press({ view } as never, "ArrowRight");
        press({ view } as never, "ArrowRight");
        expect(sampleCount("reader.page.turn")).toBe(2);

        (view as any).savePrefs({ ...(view as any).prefs, size: "large" });
        expect(sampleCount("reader.relayout")).toBe(1);

        content.oneByClass("reader-next-button").click();
        await settle(() => sampleCount("reader.chapter.open") === 2);
        expect(sampleCount("reader.chapter.turn.start")).toBe(1);
        expect(sampleCount("reader.chapter.open")).toBe(2);

        for (const write of Object.values(writes)) expect(write).not.toHaveBeenCalled();
    }, 30_000);

    it("counts an open another overtakes once — the one that was drawn", async () => {
        const { view, content } = await open(1);
        clearSamples();
        // Two chapters asked for at once: the first is superseded before it is drawn.
        void (view as any).go(1);
        void (view as any).go(1);
        await settle(() => sampleCount("reader.chapter.open") > 0 && drawn(content));
        await settle(() => false, 20);
        expect(sampleCount("reader.chapter.open")).toBe(1);
    }, 30_000);

    it("times a book's flowing chapter only: never a reading of notes, a paper or a designed page (AC-6c)", () => {
        const source = readFileSync(join(__dirname, "..", "..", "..", "..", "..", "src", "architecture", "components", "core", "reader", "ReaderView.ts"), "utf8");
        const opens = source.split('stopwatch("reader.chapter.open")');
        // One stopwatch, in the method that draws a source's chapter — a note reading has its own renderer.
        expect(opens).toHaveLength(2);
        expect(opens[0].slice(opens[0].lastIndexOf("private "))).toMatch(/^private async renderSourceChapter\(/);
        expect(opens[1]).toContain('if (doc.format === "pdf" || doc.designed || doc.chapters[index]?.designed) opening.abandon();');
    });
});
