/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "@jest/globals";
import { ReaderPager } from "architecture/components/core/reader/readerPager";
import { runsOf } from "architecture/components/core/reader/readerCode";
import { chapterText } from "architecture/components/core/reader/readerMarks";
import { columnStage, drawChapter, installColumns, type Columns } from "../../../../support/readerColumns";
import { reducedMotion } from "../../../../support/motionDom";
import { withTextNodes } from "../../../../support/domText";

/** A chapter of prose with listings of known lengths, as a book would write them. */
function chapter(listing: number, before = 0) {
    const prose = (n: number) => Array.from({ length: n }, (_, i) => `<p>${"word ".repeat(60)}${i}.</p>`).join("");
    const code = Array.from({ length: listing }, (_, i) => `    line ${i} = value(${i})`).join("\n");
    return { id: "c", href: "text/c.xhtml", body: `${prose(before)}<pre data-code-language="python"><code>${code}\n</code></pre>${prose(4)}` };
}

/** Listings whole on their page, or cut between lines and marked as continuing (#824 FR-7, AC-9, AC-M2). */
describe("a book's code, page by page (#824)", () => {
    let columns: Columns;
    let motion: () => void;
    let undo: () => void;
    beforeAll(() => {
        undo = withTextNodes();
    });
    afterAll(() => undo());
    beforeEach(() => {
        columns = installColumns({ width: 1000, height: 800 });
        motion = reducedMotion(true);
    });
    afterEach(() => {
        motion();
        columns.uninstall();
    });

    function paged(c: ReturnType<typeof chapter>, layout: "page" | "scroll" = "page") {
        const { stage, page, body } = columnStage();
        drawChapter(body, c);
        const pager = new ReaderPager(stage, page);
        pager.configure(layout, "ltr");
        pager.relayout("start");
        const pre = body.find((el: any) => el.tag === "pre");
        return { stage, page, body, pager, pre };
    }
    const columnOf = (el: any) => Math.round((el.getBoundingClientRect().left - 1) / 100);

    it("keeps a short listing whole, on the next page when this one cannot hold it", () => {
        // Prose fills most of the first page; a 12-line listing would not fit under it.
        const { pre } = paged(chapter(12, 7));
        const runs = runsOf(pre) as any[];
        expect(runs).toHaveLength(1);
        expect(runs[0].getClientRects()).toHaveLength(1);
        const first = runs[0].getBoundingClientRect();
        expect(first.top).toBe(0);
    });

    it("cuts a listing taller than a page between lines, every run but the last marked", () => {
        const { pre, body } = paged(chapter(80));
        const text = chapterText(body as never);
        const runs = runsOf(pre) as any[];
        expect(runs.length).toBeGreaterThanOrEqual(2);
        expect(runs.map((run) => run.getAttribute("data-zf-continues"))).toEqual([...runs.slice(1).map(() => "continues"), null]);
        expect(runs.reduce((sum, run) => sum + run.children.length, 0)).toBe(80);
        // Each run lies in one column, and no two runs in the same one overflow it.
        for (const run of runs) expect(run.getClientRects()).toHaveLength(1);
        for (const run of runs) expect(run.getBoundingClientRect().height).toBeLessThanOrEqual(800);
        expect(chapterText(body as never)).toBe(text);
        void columnOf;
    });

    it("is one run again in Scroll", () => {
        const { pre, pager } = paged(chapter(80));
        expect(runsOf(pre).length).toBeGreaterThan(1);
        pager.configure("scroll", "ltr");
        expect(runsOf(pre)).toHaveLength(1);
        expect((runsOf(pre)[0] as any).getAttribute("data-zf-continues")).toBeNull();
    });

    it("keeps the line you were reading in view when code lines wrap (AC-M2)", () => {
        const { pre, pager, stage } = paged(chapter(80));
        const line = (runsOf(pre) as any[]).flatMap((run) => run.children)[30];
        pager.reveal(line);
        expect(pager.onScreen(line)).toBe(true);
        stage.addClass("zettelkasten-flow__reader--code-wrap");
        pager.relayout({ anchor: line });
        expect(pager.onScreen(line)).toBe(true);
    });
});
