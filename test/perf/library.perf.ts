import { describe, it } from "@jest/globals";
import { buildShelf, layShelves, statusCounts, viewShelf, type ShelfInputs } from "application/library/shelf";
import { articleAdded, articleFields, isArticle } from "application/library/article";
import { indexBookNotes } from "application/library/bookNote";
import { reflowPage, type TextRun } from "application/library/pdfText";
import { ZipArchive } from "application/library/zip";
import { chapterTitles, packagePath, parseNav, parsePackage, type XmlParse } from "application/library/epubPackage";
import { bodyOf, sanitizeChapter, type SourceNode } from "application/library/epubSanitize";
import { makeEpub } from "../support/zipFixture";
import { parseXml } from "../support/miniXml";
import { searchBook } from "architecture/components/core/reader/readerSearch";
import { MAX_DRAWN, heldRange, mostOnScreen, runLayout, visibleWindow } from "architecture/components/core/library/sources/pdfPageView";
import { cleanDesignedCss, designedCssBook, pairSpreads } from "application/library/epubFixedLayout";
import { cropOpsOf, inkOf, measurePage, paperFrames } from "application/library/pdfCrop";
import { PDFJS_OPS } from "../support/pdfCropPaper";
import { BUDGETS, checkBudget, describeBudget, type BudgetKey } from "./budgets";
import { Component } from "obsidian";
import { DomNode } from "../support/dashboardDom";
import { OVERVIEW_LIMITS, renderOverview, type CardKind } from "architecture/components/core/reader/readerOverview";

/**
 * Library budgets (epic #675, L8).
 *
 * The shelf is rebuilt every time the Library comes back into view and on every keystroke of its
 * search, so building and viewing it is interaction latency. The other two — a PDF page reflowed,
 * an EPUB opened — are what you wait for when you turn a page or open a book.
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

function shelfInputs(sources: number, paths: number): ShelfInputs {
    const meta: ShelfInputs["meta"] = {};
    const highlights = new Map<string, number>();
    const born = new Map<string, number>();
    const list = [];
    const notes: { path: string; source: string; frontmatter: unknown }[] = [];
    for (let i = 0; i < sources; i++) {
        const path = `Library/${i % 2 ? "Books" : "Papers"}/Source number ${i}.${i % 2 ? "epub" : "pdf"}`;
        list.push({ path, basename: path.split("/").pop() as string });
        meta[path] = { size: i, mtime: i, title: `Source ${i}`, author: `Author ${i % 37}`, chapters: 10 + (i % 300), chapter: i % 9, at: i * 1000 };
        highlights.set(path, i % 13);
        born.set(path, i % 3);
        // A book's note for every source (#743 AC-8): read from the cache, never from a file.
        notes.push({
            path: `Library/Source number ${i}.md`,
            source: path,
            frontmatter: { title: `Source ${i}`, author: [`Author ${i % 37}`], series: `Series ${i % 11}`, status: ["to-read", "reading", "finished"][i % 3], collections: [`Collection ${i % 7}`, "Planning"] },
        });
    }
    const saved = Array.from({ length: paths }, (_, i) => ({
        id: `r${i}`,
        name: `Path ${i}`,
        seed: `n${i}.md`,
        paths: Array.from({ length: 12 }, (_, j) => `n${i}-${j}.md`),
        at: i,
    }));
    return { sources: list, meta, saved, highlights, born, pathPlaces: new Map(), notes: indexBookNotes(notes) };
}

/** 200 clippings as the metadata cache holds them (#744 AC-8): what Web Clipper's default template writes. */
const CLIPPINGS = Array.from({ length: 200 }, (_, i) => ({
    path: `Clippings/Article number ${i}.md`,
    ctime: i * 1000,
    frontmatter: {
        title: `Article ${i}`,
        source: `https://site${i % 17}.example.com/post/${i}`,
        author: [`[[Writer ${i % 23}]]`],
        published: `20${10 + (i % 15)}-03-02`,
        created: `2026-${String(1 + (i % 12)).padStart(2, "0")}-04`,
        description: `What article ${i} is about.`,
        tags: ["clippings"],
        ...(i % 4 === 0 ? { status: "to-read", collections: ["Planning"] } : {}),
    },
}));

/** What `gatherArticles` does with the cache: the rule, the fields, the date — no file read. */
function articlesFromCache(): NonNullable<ShelfInputs["articles"]> {
    return CLIPPINGS.filter((clip) => isArticle(clip.path, clip.frontmatter, "Clippings")).map((clip) => {
        const fields = articleFields(clip.frontmatter);
        return { path: clip.path, basename: clip.path.split("/").pop() as string, details: fields.details, ...(fields.host ? { host: fields.host } : {}), added: articleAdded(fields.created, clip.ctime) };
    });
}

describe("the Library (#675)", () => {
    it("library.shelf.500", () => {
        const inputs = shelfInputs(500, 30);
        const ms = best(5, () => {
            // And 200 articles, read off the cache (#744 AC-8).
            const items = buildShelf({ ...inputs, articles: articlesFromCache() });
            // The desk and the status shelves (#820): the default view, a narrowed one, a search, each order.
            layShelves(items, { filter: "articles", sort: "added", search: "writer 4" });
            layShelves(items, { filter: "all", sort: "recent", search: "" });
            layShelves(items, { filter: "all", sort: "title", search: "", status: "to-read" });
            layShelves(items, { filter: "books", sort: "highlighted", search: "" });
            viewShelf(items, { filter: "all", sort: "highlighted", search: "author 3" });
            viewShelf(items, { filter: "all", sort: "recent", search: "series 4", status: "reading", collection: "Planning" });
            statusCounts(items);
        });
        assertBudget("library.shelf.500", ms);
    });

    it("library.pdf.reflow.page", () => {
        // A dense two-column page of a paper: 2 × 60 lines, each in eight runs, a heading on top — every
        // fourth line set in monospace, a monospace name in every seventh (#837), a list item every fifth (#838).
        const runs: TextRun[] = [{ str: "3 Asynchronous Networks", x: 72, y: 760, size: 16, width: 200 }];
        for (const x of [72, 320]) {
            for (let line = 0; line < 60; line++) {
                for (let part = 0; part < 8; part++) {
                    // Every fifth line an item of a bulleted list (#838).
                    const str = part === 7 && line % 9 === 8 ? "end." : part === 0 && line % 5 === 4 ? `• word${line}` : `word${line}${part}`;
                    const mono = line % 4 === 3 || (line % 7 === 0 && part === 3);
                    runs.push({ str, x: x + part * 28, y: 740 - line * 11.5, size: 9, width: 25, ...(mono ? { mono } : {}) });
                }
                // A footnote marker raised after every tenth line's last word (#840).
                if (line % 10 === 5) runs.push({ str: String(line), x: x + 221, y: 743 - line * 11.5, size: 6, width: 6 });
            }
            // Three footnotes at the column's foot, small, each with its mark.
            for (const n of [5, 15, 25]) runs.push({ str: `${n} A footnote at the foot of the column, small.`, x, y: 40 - (n % 10) * 2 - Math.floor(n / 10) * 8, size: 7, width: 200 });
        }
        const ms = best(5, () => reflowPage(runs));
        assertBudget("library.pdf.reflow.page", ms);
    });

    it("library.epub.open.5mb", async () => {
        // A 5 MB book: 120 chapters of varied prose, so it deflates like a real one.
        const words = "attention effort system controller lazy law least ordinary cognitive busy".split(" ");
        let seed = 7;
        const word = () => words[(seed = (seed * 1103515245 + 12345) % 2147483648) % words.length];
        const chapters = Array.from({ length: 120 }, (_, i) => ({
            id: `c${i}`,
            href: `text/ch${i}.xhtml`,
            title: `Chapter ${i + 1}`,
            body: Array.from({ length: 70 }, () => `<p>${Array.from({ length: 80 }, word).join(" ")}.</p>`).join(""),
        }));
        // Most of a real book's weight is its pictures, already compressed: 40 of them, 115 KB each.
        const extra: Record<string, Uint8Array> = {};
        for (let i = 0; i < 40; i++) {
            const image = new Uint8Array(115 * 1024);
            let x = 2463534242 + i;
            for (let j = 0; j < image.length; j++) {
                x ^= x << 13;
                x ^= x >>> 17;
                x ^= x << 5;
                image[j] = x & 255;
            }
            extra[`OEBPS/images/plate${i}.jpg`] = image;
        }
        const bytes = makeEpub({ title: "A long book", author: "Someone", chapters, extra });
        const parse = parseXml as unknown as XmlParse;
        const root = { tag: "root", children: 0 };
        const builder = { element: (parent: typeof root) => ((parent.children++), parent), text: () => undefined };
        let fastest = Number.POSITIVE_INFINITY;
        for (let i = 0; i < 3; i++) {
            const started = performance.now();
            const archive = new ZipArchive(bytes);
            const opfPath = packagePath((await archive.text("META-INF/container.xml"))!, parse)!;
            const pkg = parsePackage((await archive.text(opfPath))!, opfPath, parse);
            const toc = parseNav((await archive.text(pkg.navHref!))!, pkg.navHref!, parse);
            chapterTitles(pkg.spine, toc);
            const chapter = (await archive.text(pkg.spine[60].href))!;
            sanitizeChapter(bodyOf(parse(chapter, "application/xhtml+xml").documentElement as unknown as SourceNode), root, builder, pkg.spine[60].href);
            fastest = Math.min(fastest, performance.now() - started);
        }
        // eslint-disable-next-line no-console
        console.log(`epub fixture: ${(bytes.length / 1024 / 1024).toFixed(1)} MB`);
        assertBudget("library.epub.open.5mb", fastest);
    });

    it("reader.search.1k", () => {
        const sentence = "The best modules give a lot of power through a small, simple interface; depth is what they hide. ";
        const texts = Array.from({ length: 1_000 }, (_, i) => sentence.repeat(50) + `Chapter ${i} ends with an informática note.`);
        let found = 0;
        const ms = best(3, () => {
            found = searchBook(texts, "modules").matches.length + searchBook(texts, "informatica").matches.length;
        });
        if (found === 0) throw new Error("the search found nothing");
        assertBudget("reader.search.1k", ms);
    });
    it("reader.pdf.window.600", () => {
        const view = { width: 1000, height: 800 };
        const boxes = Array.from({ length: 600 }, (_, i) => (i % 50 === 7 ? { width: 792, height: 612 } : { width: 612, height: 792 }));
        const run = runLayout(boxes, { layout: "scroll", across: false, scale: 968 / 612, view });
        let most = 0;
        let drawn = 0;
        const ms = best(3, () => {
            for (let step = 0; step <= 2_000; step++) {
                const top = ((run.height - view.height) * step) / 2_000;
                const near = visibleWindow(run.slots, { left: 0, top }, view);
                most = Math.max(most, mostOnScreen(near, { left: 0, top }, view));
                drawn = Math.max(drawn, near.length);
            }
        });
        // FR-14: however long the paper, at most seven pages are ever drawn.
        if (drawn > MAX_DRAWN || drawn === 0) throw new Error(`drew ${drawn} pages at once`);
        if (most !== 599) throw new Error(`the last page most on screen was ${most}`);
        assertBudget("reader.pdf.window.600", ms);
    });
    it("reader.overview.600", () => {
        // The overview of a 600-page paper, a 300-page comic and a 120-chapter book (#776 FR-17, AC-12):
        // built, then scrolled from the first card to the last, ten cards in view at a time — a fake
        // draw, no pixels. Only what is in view is drawn, and the pictures held stay at the cap.
        const g = globalThis as unknown as { IntersectionObserver?: unknown };
        const had = g.IntersectionObserver;
        let seen: (entries: { target: unknown; isIntersecting: boolean }[]) => void = () => undefined;
        g.IntersectionObserver = class {
            constructor(callback: typeof seen) {
                seen = callback;
            }
            observe(): void {}
            disconnect(): void {}
        };
        const cap = OVERVIEW_LIMITS.mobile.pictures;
        const freed: { width: number }[] = [];
        let worst = 0;
        try {
            const books: [number, CardKind][] = [[600, "page"], [300, "page"], [120, "chapter"]];
            const ms = best(3, () => {
                for (const [count, kind] of books) {
                    const list = new DomNode();
                    const scope = new Component();
                    scope.load();
                    let draws = 0;
                    const overview = renderOverview(
                        list as unknown as HTMLElement,
                        {
                            units: Array.from({ length: count }, (_, index) => ({ index, kind, label: `Card ${index + 1}` })),
                            current: 0,
                            ratio: () => 1.3,
                            draw: (_i, picture, _w, done) => {
                                draws++;
                                const canvas = picture.createEl("canvas") as unknown as { width: number; height: number };
                                canvas.width = 192;
                                canvas.height = 248;
                                freed.push(canvas);
                                done();
                                return () => undefined;
                            },
                            marks: () => ({ ticks: [], pen: false, ribbon: false }),
                            progress: () => (kind === "chapter" ? 0 : null),
                            onPick: () => undefined,
                            limit: cap,
                            fade: true,
                        },
                        scope
                    );
                    if (draws !== 0) throw new Error("the overview drew before anything was in view");
                    const cards = list.byClass("reader-overview-card");
                    for (let top = 0; top + 10 <= count; top += 3) {
                        seen([
                            ...cards.slice(Math.max(0, top - 3), top).map((target) => ({ target, isIntersecting: false })),
                            ...cards.slice(top, top + 10).map((target) => ({ target, isIntersecting: true })),
                        ]);
                        worst = Math.max(worst, overview.held().length);
                    }
                    if (draws > count + cap) throw new Error(`drew ${draws} cards for ${count}`);
                    overview.dispose();
                    scope.unload();
                }
            });
            if (worst > cap || worst === 0) throw new Error(`held ${worst} pictures at once (cap ${cap})`);
            if (freed.some((canvas) => canvas.width !== 0)) throw new Error("a released card kept its pixels");
            assertBudget("reader.overview.600", ms);
        } finally {
            g.IntersectionObserver = had;
        }
    });
    it("library.epub.fxl.window.300", () => {
        // A 300-page comic in Spread, its first page alone: turned end to end, each view laid out and the
        // pages held by the run's own rule (the view, two pages either side). A fake draw: no DOM.
        const sides = Array.from({ length: 300 }, (_, i) => (i === 0 ? ("right" as const) : undefined));
        const boxes = sides.map(() => ({ width: 600, height: 800 }));
        let peak = 0;
        const ms = best(5, () => {
            const views = pairSpreads(sides, { direction: "ltr", spread: "auto", landscape: true, explicit: true });
            let held = new Set<number>();
            for (const view of views) {
                const laid = runLayout(boxes, { layout: "spread", across: false, scale: 0.6, view: { width: 1200, height: 800 }, current: view.pages[0], views });
                const near = laid.pages;
                const { lo, hi } = heldRange(near);
                held = new Set([...held].filter((page) => page >= lo && page <= hi));
                for (const page of near) held.add(page);
                peak = Math.max(peak, held.size);
            }
        });
        // FR-9: however long the comic, at most six of its pages are ever held.
        if (peak > 6 || peak === 0) throw new Error(`held ${peak} pages at once`);
        assertBudget("library.epub.fxl.window.300", ms);
    });

    it("library.epub.fxl.css.200kb", () => {
        // A designed page's 200 KB stylesheet: rules, fonts, pictures and media queries, cleaned (#771).
        const rule = (i: number) =>
            `.panel-${i} > p.balloon{position:absolute;left:${i % 600}px;top:calc(${i % 800}px + 2%);background:url(../img/p${i % 40}.png) no-repeat;font-family:"Comic", serif;color:rgb(0 0 0 / 80%);transform:rotate(${i % 7}deg)}\n`;
        let css = '@font-face{font-family:"Comic";src:url(../fonts/comic.woff2)}\n@media (min-width: 600px){.a{color:red}}\n';
        for (let i = 0; css.length < 200 * 1024; i++) css += rule(i);
        const ms = best(5, () => cleanDesignedCss({ sheets: [{ text: css, href: "OEBPS/css/page.css" }], inline: [], href: "OEBPS/p1.xhtml" }, designedCssBook("k")));
        assertBudget("library.epub.fxl.css.200kb", ms);
    });

    it("library.pdf.crop.frames", () => {
        // 24 dense sampled pages: ~1,000 text runs and ~2,000 operators each (a figure-heavy paper).
        const ops = cropOpsOf(PDFJS_OPS)!;
        const pages = Array.from({ length: 24 }, (_, p) => {
            const items = Array.from({ length: 1_000 }, (_, i) => ({ str: "word", transform: [9, 0, 0, 9, 72 + (i % 4) * 120 + ((p + 1) % 2) * 30, 720 - Math.floor(i / 4) * 2.6], width: 100, height: 9 }));
            const fnArray: number[] = [];
            const argsArray: unknown[] = [];
            for (let i = 0; i < 500; i++) {
                fnArray.push(PDFJS_OPS.save, PDFJS_OPS.transform, PDFJS_OPS.constructPath, PDFJS_OPS.restore);
                argsArray.push(null, [1, 0, 0, 1, 200 + (i % 10), 100 + (i % 37)], [PDFJS_OPS.fill, [new Float32Array([0, 0, 0, 1, 10, 10])], new Float32Array([0, 0, 10 + (i % 5), 10])], null);
            }
            return { items, list: { fnArray, argsArray } };
        });
        const toView = (rect: ArrayLike<number>) => [rect[0], 792 - rect[1], rect[2], 792 - rect[3]];
        let frames = paperFrames([]);
        const ms = best(3, () => {
            frames = paperFrames(pages.map((page, index) => ({ index, ink: inkOf(measurePage(page.items, page.list, ops, toView, 612, 792)) })));
        });
        if (!frames || frames.right.x <= frames.left.x) throw new Error("the frames were not found");
        assertBudget("library.pdf.crop.frames", ms);
    });
});
