/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "@jest/globals";
import { Component, TFile, __setPrism } from "obsidian";
import { DomNode, installBrowserGlobals } from "../support/dashboardDom";
import { parseXml } from "../support/miniXml";
import { withTextNodes } from "../support/domText";
import { fakePrism } from "../support/fakePrism";
import { recordAnimations, reducedMotion, type AnimationRecord } from "../support/motionDom";
import { columnStage, drawChapter, installColumns, wearType, type Columns } from "../support/readerColumns";
import { openEpubSource } from "architecture/components/core/library/sources/epubSource";
import { ReaderPager } from "architecture/components/core/reader/readerPager";
import { pageShape } from "architecture/components/core/reader/readerPages";
import { endChapterTurn, playChapterTurn } from "architecture/components/core/reader/readerTurn";
import { sampleCount } from "architecture/monitoring/measure";
import { BUDGETS, checkBudget, describeBudget, type BudgetKey } from "./budgets";
import { generateBook } from "./generateBook";

/**
 * **The four moments a reader waits through** (#825, epic #827).
 *
 * Open a chapter, turn a page, lay it out again after a type change, start a chapter turn. jest has
 * no layout engine, so the chapter is laid out by the column model (`readerColumns`): what is timed
 * here is **the Reader's own work** over a laid-out chapter — never the browser's paint, its column
 * breaking or its `DOMParser` (the tests' `miniXml` parses, as in `library.epub.open.5mb`). The real
 * numbers are the app's, posted on #825. What these gates catch is a change of **shape**: a turn that
 * starts laying out, a sheet that copies the chapter, a relayout that loses the line.
 */
function assertBudget(key: BudgetKey, measured: number): void {
    const result = checkBudget(key, measured);
    // eslint-disable-next-line no-console
    console.log(describeBudget(result));
    if (!result.within) throw new Error(`${describeBudget(result)} — this budget exists because: ${BUDGETS[key].because}`);
}

/** The best of a few runs: the gate is for a change in shape, not a noisy runner. */
function best(runs: number, work: () => unknown): number {
    let fastest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < runs; i++) {
        const started = performance.now();
        work();
        fastest = Math.min(fastest, performance.now() - started);
    }
    return fastest;
}

const g = globalThis as any;
let undoText: () => void;
const BOOK = generateBook(7);

function laid(chapter: "long" | "short", layout: "page" | "spread" = "page") {
    const { stage, page, body } = columnStage();
    drawChapter(body, BOOK[chapter]);
    const pager = new ReaderPager(stage, page);
    pager.configure(layout, "ltr");
    pager.relayout("start");
    return { stage, page, body, pager };
}

describe("the Reader's four moments (#825)", () => {
    let columns: Columns;
    let rec: AnimationRecord;
    let motion: () => void;
    beforeAll(() => {
        g.DOMParser = class {
            parseFromString(text: string) {
                return { ...parseXml(text), getElementsByTagName: () => [] };
            }
        };
        undoText = withTextNodes();
        // Obsidian's Prism, as its shape (#824): the colouring is timed with the grammars jest has.
        __setPrism(fakePrism);
        g.URL.createObjectURL = () => "blob:1";
        g.URL.revokeObjectURL = () => undefined;
    });
    afterAll(() => {
        delete g.DOMParser;
        undoText();
        __setPrism(null);
    });
    beforeEach(() => {
        installBrowserGlobals();
        g.addEventListener ??= () => undefined;
        g.removeEventListener ??= () => undefined;
        columns = installColumns({ width: 1000, height: 800 });
        rec = recordAnimations();
        motion = reducedMotion(false);
    });
    afterEach(() => {
        endChapterTurn();
        rec.stop();
        motion();
        columns.uninstall();
    });

    it("reader.chapter.open", async () => {
        // The book is opened once, outside the timing: its directory and package are the 5 MB budget's.
        const file = Object.assign(new TFile(), { path: "Books/technical.epub", extension: "epub", stat: { size: BOOK.bytes.length } });
        const app = { vault: { readBinary: async () => BOOK.bytes.buffer.slice(BOOK.bytes.byteOffset, BOOK.bytes.byteOffset + BOOK.bytes.byteLength) } };
        const doc = await openEpubSource(app as never, file);
        let fastest = Number.POSITIVE_INFINITY;
        for (let run = 0; run < 3; run++) {
            const { stage, page, body } = columnStage();
            const component = new Component();
            const started = performance.now();
            await doc.draw(0, body, component, "reading");
            const pager = new ReaderPager(stage, page);
            pager.configure("page", "ltr");
            pager.relayout("start");
            fastest = Math.min(fastest, performance.now() - started);
            expect(pager.views).toBeGreaterThan(100);
            component.unload();
        }
        assertBudget("reader.chapter.open", fastest);
    });

    it("reader.page.turn", () => {
        const { pager } = laid("long");
        const paginated = sampleCount("reader.paginate");
        const reflows = columns.reflows;
        const widths = columns.widthReads;
        rec.animations.splice(0);
        let dir: 1 | -1 = 1;
        const started = performance.now();
        for (let i = 0; i < 1000; i++) {
            if (!pager.canTurn(dir)) dir = dir === 1 ? -1 : 1;
            pager.turn(dir);
        }
        const perTurn = (performance.now() - started) / 1000;
        // A turn moves the strip and lays out nothing (AC-2).
        expect(sampleCount("reader.paginate")).toBe(paginated);
        expect(columns.reflows).toBe(reflows);
        expect(columns.widthReads).toBe(widths);
        expect(rec.animations).toHaveLength(1000);
        assertBudget("reader.page.turn", perTurn);
    });

    it("reader.relayout", () => {
        const rows: [string, (env: ReturnType<typeof laid>) => void][] = [
            ["font", ({ stage }) => wearType(stage, "font", "sans")],
            ["size", ({ stage }) => wearType(stage, "size", "large")],
            ["spacing", ({ stage }) => wearType(stage, "spacing", "airy")],
            ["width", ({ pager }) => pager.configure("page", "ltr", pageShape("wide", "medium"))],
            ["margins", ({ pager }) => pager.configure("page", "ltr", pageShape("medium", "large"))],
            ["layout", ({ pager }) => pager.configure("spread", "ltr")],
        ];
        let slowest = 0;
        for (const [row, change] of rows) {
            const env = laid("long");
            // Somewhere in the middle of the chapter, as a reader is.
            env.pager.goTo(Math.floor(env.pager.views / 2));
            const ms = best(3, () => {
                const anchor = env.pager.firstVisible();
                expect(anchor).not.toBeNull();
                change(env);
                env.pager.relayout({ anchor: anchor! });
                // The same passage in view afterwards (AC-4), asserted — not only timed.
                expect({ row, same: env.pager.viewHolding(anchor!) === env.pager.current }).toEqual({ row, same: true });
                expect({ row, visible: env.pager.visibleBlocks().includes(anchor as HTMLElement) }).toEqual({ row, visible: true });
            });
            slowest = Math.max(slowest, ms);
        }
        assertBudget("reader.relayout", slowest);
    });

    it("reader.chapter.turn.start", () => {
        const { stage, page } = laid("long");
        const root = stage.parent ?? new DomNode();
        if (!stage.parent) root.appendChild(stage);
        (root as any).win = { matchMedia: () => ({ matches: false }), setTimeout: () => 0, addEventListener: () => undefined, removeEventListener: () => undefined };
        const ms = best(5, () => {
            playChapterTurn(root as never, stage, page, "stack", 1);
            endChapterTurn();
        });
        assertBudget("reader.chapter.turn.start", ms);
    });

    it("reader.code.chapter.300", async () => {
        // A chapter of 300 listings (~5,000 lines), rebuilt, coloured and cut into lines (#824 FR-9).
        const file = Object.assign(new TFile(), { path: "Books/technical.epub", extension: "epub", stat: { size: BOOK.bytes.length } });
        const app = { vault: { readBinary: async () => BOOK.bytes.buffer.slice(BOOK.bytes.byteOffset, BOOK.bytes.byteOffset + BOOK.bytes.byteLength) } };
        const doc = await openEpubSource(app as never, file);
        let fastest = Number.POSITIVE_INFINITY;
        for (let run = 0; run < 3; run++) {
            const { body } = columnStage();
            const component = new Component();
            const started = performance.now();
            const drawn = await doc.draw(2, body, component, "reading");
            fastest = Math.min(fastest, performance.now() - started);
            expect(drawn.listings).toBe(300);
            component.unload();
        }
        assertBudget("reader.code.chapter.300", fastest);
    });

    it("reader.chapter.turn.shape", () => {
        // The sheet holds what is on screen: a chapter ten times longer copies the same page (AC-3).
        const copied = (chapter: "long" | "short") => {
            const { stage, page } = laid(chapter);
            const root = new DomNode();
            root.appendChild(stage);
            (root as any).win = { matchMedia: () => ({ matches: false }), setTimeout: () => 0, addEventListener: () => undefined, removeEventListener: () => undefined };
            const started = performance.now();
            playChapterTurn(root as never, stage, page, "stack", 1);
            const ms = performance.now() - started;
            const nodes = root.byClass("turn-sheet")[0].findAll(() => true).length;
            endChapterTurn();
            return { nodes, ms };
        };
        const short = copied("short");
        const long = copied("long");
        expect(short.nodes).toBeGreaterThan(0);
        // eslint-disable-next-line no-console
        console.log(`chapter turn: ${short.nodes} → ${long.nodes} nodes, ${short.ms.toFixed(2)} → ${long.ms.toFixed(2)} ms (time ratio, not gated: ${(long.ms / short.ms).toFixed(1)})`);
        assertBudget("reader.chapter.turn.shape", long.nodes / short.nodes);
    });
});
