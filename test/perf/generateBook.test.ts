/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { ReaderPager } from "architecture/components/core/reader/readerPager";
import { columnStage, drawChapter, installColumns, type Columns } from "../support/readerColumns";
import { reducedMotion } from "../support/motionDom";
import { generateBook, writeBookIfAsked } from "./generateBook";

/**
 * The book the Reader's budgets measure against (#825).
 *
 * Like the synthetic vault, the generator runs in the normal suite: a book that changes between
 * runs, or is not shaped like a technical book, would make every budget built on it meaningless.
 */
describe("a book we can measure (#825)", () => {
    const book = generateBook(7);

    it("is deterministic: the same seed gives the same chapters, byte for byte", () => {
        const again = generateBook(7);
        for (const key of ["long", "short", "listings", "footnotes"] as const) {
            expect(again[key].body).toBe(book[key].body);
        }
        expect(Buffer.from(again.bytes).equals(Buffer.from(book.bytes))).toBe(true);
    });

    it("is not one book repeated: a different seed gives a different one", () => {
        expect(generateBook(8).long.body).not.toBe(book.long.body);
    });

    it("has a long chapter of about a megabyte, with what a technical book holds", () => {
        const long = book.long.body;
        expect(Buffer.byteLength(long, "utf8")).toBeGreaterThanOrEqual(1_000_000);
        for (const part of ["<pre", "<code", "<table>", "<figure><img", 'epub:type="footnote"', "<h2>"]) {
            expect({ part, present: long.includes(part) }).toEqual({ part, present: true });
        }
    });

    it("has a short chapter a tenth of the long one, the same mix", () => {
        const share = book.short.body.length / book.long.body.length;
        expect(share).toBeGreaterThan(0.08);
        expect(share).toBeLessThan(0.12);
        expect(book.short.body).toContain("<pre");
    });

    it("has a chapter dense with listings, each naming its language (#824 reads it)", () => {
        const listings = book.listings.body.match(/<pre /g) ?? [];
        expect(listings.length).toBe(300);
        expect(book.listings.body).toContain('data-code-language="');
        expect(book.listings.body).toContain('class="language-');
    });

    it("reads no clock and no global random, so it cannot drift", () => {
        const source = readFileSync(join(__dirname, "generateBook.ts"), "utf8");
        expect(source).not.toMatch(/Date\.|Math\.random/);
    });

    it("writes nothing unless asked", () => {
        expect(writeBookIfAsked({})).toBeUndefined();
    });

    it("writes the book where it is asked to, for a walk by hand", () => {
        const target = writeBookIfAsked(process.env);
        if (target) expect(readFileSync(target).length).toBe(book.bytes.length);
    });
});

/**
 * The column model the budgets lay the book out with (#825 T4). It runs in the normal suite: a model
 * that miscounted pages, or laid out on a turn, would make B2 and B3 prove nothing.
 */
describe("the column model (#825)", () => {
    const book = generateBook(7);
    let columns: Columns;
    let motion: () => void;
    beforeEach(() => {
        columns = installColumns({ width: 1000, height: 800 });
        motion = reducedMotion(true);
    });
    afterEach(() => {
        motion();
        columns.uninstall();
    });

    function paged(layout: "page" | "spread" = "page", size = "medium") {
        const { stage, page, body } = columnStage({ size });
        drawChapter(body, book.long);
        const pager = new ReaderPager(stage, page);
        pager.configure(layout, "ltr");
        pager.relayout("start");
        return { stage, page, body, pager };
    }

    it("lays the long chapter out in a hundred pages and more", () => {
        expect(paged().pager.views).toBeGreaterThan(100);
    });

    it("gives more pages to a larger size", () => {
        const medium = paged("page", "medium").pager.views;
        expect(paged("page", "large").pager.views).toBeGreaterThan(medium);
    });

    it("shows two pages at once in a spread that fits", () => {
        columns.uninstall();
        columns = installColumns({ width: 1600, height: 800 });
        expect(paged("spread").pager.perView).toBe(2);
    });

    it("cuts a block a column break runs through into pieces, one per column", () => {
        const { pager } = paged();
        const cut = pager.blocks().find((block) => ((block as any).getClientRects() as unknown[]).length > 1);
        expect(cut).toBeDefined();
        expect((cut as any).getClientRects()).toHaveLength(2);
    });

    it("lays out again when the page's shape changes, and never when the strip only moves", () => {
        const { page, pager } = paged();
        const before = columns.reflows;
        pager.turn(1);
        pager.turn(1);
        void pager.visibleBlocks();
        expect(columns.reflows).toBe(before);
        page.setCssProps({ "--zf-page-col": "400px" });
        void page.scrollWidth;
        expect(columns.reflows).toBe(before + 1);
    });
});
