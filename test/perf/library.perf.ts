import { describe, it } from "@jest/globals";
import { buildShelf, continueReading, viewShelf, type ShelfInputs } from "application/library/shelf";
import { reflowPage, type TextRun } from "application/library/pdfText";
import { ZipArchive } from "application/library/zip";
import { chapterTitles, packagePath, parseNav, parsePackage, type XmlParse } from "application/library/epubPackage";
import { bodyOf, sanitizeChapter, type SourceNode } from "application/library/epubSanitize";
import { makeEpub } from "../support/zipFixture";
import { parseXml } from "../support/miniXml";
import { searchBook } from "architecture/components/core/reader/readerSearch";
import { MAX_DRAWN, mostOnScreen, runLayout, visibleWindow } from "architecture/components/core/library/sources/pdfPageView";
import { cropOpsOf, inkOf, measurePage, paperFrames } from "application/library/pdfCrop";
import { PDFJS_OPS } from "../support/pdfCropPaper";
import { BUDGETS, checkBudget, describeBudget, type BudgetKey } from "./budgets";

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
    for (let i = 0; i < sources; i++) {
        const path = `Library/${i % 2 ? "Books" : "Papers"}/Source number ${i}.${i % 2 ? "epub" : "pdf"}`;
        list.push({ path, basename: path.split("/").pop() as string });
        meta[path] = { size: i, mtime: i, title: `Source ${i}`, author: `Author ${i % 37}`, chapters: 10 + (i % 300), chapter: i % 9, at: i * 1000 };
        highlights.set(path, i % 13);
        born.set(path, i % 3);
    }
    const saved = Array.from({ length: paths }, (_, i) => ({
        id: `r${i}`,
        name: `Path ${i}`,
        seed: `n${i}.md`,
        paths: Array.from({ length: 12 }, (_, j) => `n${i}-${j}.md`),
        at: i,
    }));
    return { sources: list, meta, saved, highlights, born, pathPlaces: new Map() };
}

describe("the Library (#675)", () => {
    it("library.shelf.500", () => {
        const inputs = shelfInputs(500, 30);
        const ms = best(5, () => {
            const items = buildShelf(inputs);
            continueReading(items);
            viewShelf(items, { filter: "all", sort: "recent", search: "" });
            viewShelf(items, { filter: "all", sort: "highlighted", search: "author 3" });
        });
        assertBudget("library.shelf.500", ms);
    });

    it("library.pdf.reflow.page", () => {
        // A dense two-column page of a paper: 2 × 60 lines, each in eight runs, a heading on top.
        const runs: TextRun[] = [{ str: "3 Asynchronous Networks", x: 72, y: 760, size: 16, width: 200 }];
        for (const x of [72, 320]) {
            for (let line = 0; line < 60; line++) {
                for (let part = 0; part < 8; part++) {
                    const str = part === 7 && line % 9 === 8 ? "end." : `word${line}${part}`;
                    runs.push({ str, x: x + part * 28, y: 740 - line * 11.5, size: 9, width: 25 });
                }
            }
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
