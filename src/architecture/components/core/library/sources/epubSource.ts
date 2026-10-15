import type { App, Component, TFile } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { titleFromName } from "application/library/shelf";
import { fragmentOf, spineIndexOf, type PageTarget } from "application/library/epubPackage";
import type { PageMark } from "application/library/provenance";
import { offsetAt, type NodeLike } from "architecture/components/core/reader/readerMarks";
import { bodyOf, chapterLanguage, sanitizeChapter, type ChapterBuilder, type SourceNode } from "application/library/epubSanitize";
import { MATH_NS, SVG_NS } from "application/library/epubForeign";
import { MOTION } from "architecture/components/core/reader/readerMotion";
import { designedCssBook, layoutOf, pageSize, pairSpreads, spreadSide, type PageSize } from "application/library/epubFixedLayout";
import { domParse, imageType, openEpub, type OpenEpub } from "./epub";
import { DesignedFonts, designedPageSize, drawDesignedPage, type DesignedBook, type DesignedDrawing } from "./epubDesigned";
import type { DrawnChapter, SourceDocument, SourcePages, SourceTocEntry } from "./sourceDocument";

/**
 * The clean chapter, built with Obsidian's own element helpers — never `innerHTML` (L4). A drawing
 * is made with `createSvg`, an equation in the MathML namespace of the chapter's own document (a
 * pop-out window has its own); Obsidian has no MathML helper (#770).
 */
const domBuilder: ChapterBuilder<Element> = {
    element(parent, tag, attrs, ns) {
        const { ["data-zf-outlink"]: outlink, ...rest } = attrs;
        const cls = outlink ? { cls: c("reader-source-outlink") } : {};
        if (ns === "svg") return parent.createSvg(tag as keyof SVGElementTagNameMap, { attr: rest, ...cls });
        if (ns === "math") {
            const el = parent.doc.createElementNS(MATH_NS, tag);
            for (const [name, value] of Object.entries(rest)) el.setAttr(name, value);
            parent.appendChild(el);
            return el;
        }
        return parent.createEl(tag as keyof HTMLElementTagNameMap, { attr: rest, ...cls });
    },
    text(parent, text) {
        parent.appendText(text);
    },
};

/** How long a turned chapter's pictures outlive it: the longest chapter turn, and a beat more. */
const RELEASE_AFTER_MS = MOTION.turn + MOTION.base;

/**
 * Where the print pages the book declares begin in a drawn chapter (#751 FR-3): its page-break marks
 * (kept by the sanitizer as `span[data-zf-page]`) and its page-list targets in this spine item. Read
 * once, as offsets into the chapter's text. None: the book declares no pages here, and none is made up.
 */
function pageMarksOf(body: HTMLElement, targets: readonly PageTarget[]): PageMark[] {
    const root = body as unknown as NodeLike;
    const marks: PageMark[] = [];
    for (const el of Array.from(body.querySelectorAll<HTMLElement>("[data-zf-page]"))) {
        const offset = offsetAt(root, el);
        const label = el.getAttribute("data-zf-page");
        if (offset !== null && label) marks.push({ label, offset });
    }
    for (const target of targets) {
        const id = target.fragment;
        const el = id ? (Array.from(body.querySelectorAll<HTMLElement>("[data-zf-id]")).find((node) => node.getAttribute("data-zf-id") === id) ?? null) : null;
        const offset = target.fragment ? (el ? offsetAt(root, el) : null) : 0;
        if (offset !== null && !marks.some((mark) => mark.label === target.label)) marks.push({ label: target.label, offset });
    }
    return marks.sort((a, b) => a.offset - b.offset);
}

/**
 * **An EPUB in the Reader** (#682, epic #675): chapters are the book's spine, named from its own
 * contents (the EPUB 3 `nav`, or the EPUB 2 `toc.ncx`). Each chapter is parsed by the platform as
 * data and rebuilt node by node by the sanitizer, so nothing the book carries can run, style the
 * page or reach the network. Its images are read from the archive and shown as object URLs, let go
 * when the chapter turns.
 */
export async function openEpubSource(app: App, file: TFile): Promise<SourceDocument> {
    const book = await openEpub(app, file);
    const all = book.pkg.spine.map((item, index) => ({ item, index }));
    // The reading order: the linear spine — a cover or a pop-up note outside it is not a chapter.
    const linear = all.filter((entry) => entry.item.linear);
    const spine = (linear.length > 0 ? linear : all).map((entry) => entry.item);
    const titles = spine.map((item) => book.titles[book.pkg.spine.indexOf(item)] ?? null);
    // Fixed layout (#771 FR-1): each page as it declares, over what the book declares.
    const designed = spine.map((item) => layoutOf(book.pkg, item) === "pre-paginated");
    const wholly = designed.length > 0 && designed.every(Boolean);
    const chapters = spine.map((item, i) => ({
        label: titles[i] ?? t(wholly ? "reader_source_page" : "reader_source_chapter", String(i + 1)),
        key: item.href,
        ...(titles[i] ? {} : { untitled: true as const }),
        ...(designed[i] ? { designed: true as const } : {}),
    }));
    const pagesOf = designed.some(Boolean) ? designedPages(file, book, spine.map((item) => item.href)) : null;
    // Where the text begins (#808 FR-1): only a chapter the reading order has — never a skipped page.
    const startAt = book.text ? spineIndexOf(spine, book.text.href) : -1;
    const toc: SourceTocEntry[] = [];
    for (const entry of book.toc) {
        const chapter = spineIndexOf(spine, entry.href);
        if (chapter >= 0) toc.push({ title: entry.title, chapter, depth: entry.depth, ...(entry.fragment ? { fragment: entry.fragment } : {}) });
    }

    return {
        format: "epub",
        path: file.path,
        title: book.pkg.title ?? titleFromName(file.name),
        ...(book.pkg.author ? { author: book.pkg.author } : {}),
        chapters,
        toc,
        imageOnly: false,
        hasPageView: false,
        // A wholly designed book is read as its pages, through the run (#771 FR-5, FR-6).
        ...(wholly && pagesOf ? { designed: true as const, pages: await pagesOf.pages(spine.map(spreadSide)) } : {}),
        ...(book.pkg.direction === "rtl" ? { direction: "rtl" as const } : {}),
        ...(book.pkg.language ? { language: book.pkg.language } : {}),
        ...(startAt > 0 && !wholly ? { start: { chapter: startAt, ...(book.text?.fragment ? { fragment: book.text.fragment } : {}) } } : {}),
        async draw(index: number, body: HTMLElement, component: Component): Promise<DrawnChapter> {
            const href = spine[index]?.href;
            // A designed page among flowing chapters (#771 FR-1): itself, fitted to the column.
            if (href && designed[index] && pagesOf) return pagesOf.drawInColumn(index, body, component);
            const xhtml = href ? await book.archive.text(href) : null;
            if (!href || xhtml === null) throw new Error(`no chapter ${index}`);
            const doc = domParse(xhtml, "application/xhtml+xml");
            const root = doc.documentElement as unknown as SourceNode | null;
            if (!root) throw new Error(`chapter ${index} cannot be read`);
            const { images } = sanitizeChapter(bodyOf(root), body, domBuilder, href);
            if (images.length > 0) {
                const urls: string[] = [];
                // Let go once the chapter turn has played: its sheet is a copy of this page, and a
                // drawing's picture in that copy reads the same URL again (#770) — an `<img>` does not.
                component.register(() => (body.win ?? window).setTimeout(() => urls.forEach((url) => URL.revokeObjectURL(url)), RELEASE_AFTER_MS));
                // A picture, and a drawing's own: both read from the archive, never from a URL (#770).
                for (const img of Array.from(body.querySelectorAll("img, image"))) {
                    const path = img.getAttribute("data-zf-src");
                    if (!path) continue;
                    try {
                        const bytes = await book.archive.bytes(path);
                        if (!bytes) continue;
                        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: imageType(book, path) }));
                        urls.push(url);
                        img.setAttribute(img.namespaceURI === SVG_NS ? "href" : "src", url);
                    } catch (error) {
                        log.debug(`[Reader] an image of ${file.path} cannot be read: ${String(error)}`);
                    }
                }
            }
            const text = body.textContent ?? "";
            // A chapter of pictures and no words — a cover (#808 FR-7): one page, the picture fitted to it.
            const cover = images.length > 0 && !text.trim();
            if (cover) body.addClass(c("reader-source-body--cover"));
            // What an untitled chapter calls itself (#808 FR-11): its first heading, read as it is drawn.
            const heading = chapters[index]?.untitled ? firstHeading(body) : "";
            const language = chapterLanguage(root);
            const pageMarks = pageMarksOf(body, book.pages.filter((target) => target.href === href));
            return {
                words: text.split(/\s+/).filter(Boolean).length,
                picture: false,
                ...(language ? { language } : {}),
                ...(pageMarks.length > 0 ? { pageMarks } : {}),
                ...(heading ? { heading } : {}),
                ...(cover ? { cover } : {}),
            };
        },
        async imageBytes(archivePath: string): Promise<Blob | null> {
            const bytes = await book.archive.bytes(archivePath);
            return bytes ? new Blob([bytes as BlobPart], { type: imageType(book, archivePath) }) : null;
        },
        resolveLink(_from: number, href: string) {
            const [path] = href.split("#");
            const chapter = spineIndexOf(spine, path);
            if (chapter < 0) return null;
            const fragment = fragmentOf(href);
            return { chapter, ...(fragment ? { fragment } : {}) };
        },
        close(): void {
            // The archive is in memory and goes with the reading; a designed book's fonts go with it (#771).
            pagesOf?.close();
        },
    };
}

/** The first heading's words (#808 FR-11), on one line and at most 80 characters; empty when none. */
function firstHeading(body: HTMLElement): string {
    const text = (body.querySelector("h1, h2, h3, h4, h5, h6")?.textContent ?? "").replace(/\s+/g, " ").trim();
    return text.length > 80 ? `${text.slice(0, 79).trimEnd()}…` : text;
}

/** A short, stable key for a book's font names: the same file always names its fonts the same. */
function bookKey(path: string): string {
    let hash = 2166136261;
    for (let i = 0; i < path.length; i++) hash = Math.imul(hash ^ path.charCodeAt(i), 16777619) >>> 0;
    return hash.toString(36);
}

/**
 * **The designed pages of a book** (#771): their sizes (read once each), the run's `SourcePages` for a
 * wholly designed book, and a designed page drawn in the column for a book that mixes both.
 */
function designedPages(file: TFile, book: OpenEpub, hrefs: string[]) {
    const fonts = new DesignedFonts();
    const designedBook: DesignedBook = {
        text: (path) => book.archive.text(path),
        bytes: (path) => book.archive.bytes(path),
        imageType: (path) => imageType(book, path),
        parse: domParse,
        builder: domBuilder,
        css: designedCssBook(bookKey(file.path)),
        fonts,
    };
    const sizes = new Map<number, Promise<PageSize>>();
    const sizeOf = (index: number): Promise<PageSize> => {
        let known = sizes.get(index);
        if (!known) {
            const href = hrefs[index];
            known = (href ? designedPageSize(designedBook, href) : Promise.resolve(null))
                .catch(() => null)
                .then((own) => {
                    // A page that says no size is the default's (a spec gap of #771, settled: 768 x 1024).
                    if (!own) log.debug(`[Reader] page ${index + 1} of ${file.path} declares no size`);
                    return pageSize(own, book.pkg);
                });
            sizes.set(index, known);
        }
        return known;
    };

    /** Draw page `index` into `into`; one that cannot be drawn says so in its place (FR-10). */
    const drawInto = async (index: number, into: HTMLElement, alive: () => boolean): Promise<DesignedDrawing | null> => {
        const href = hrefs[index];
        try {
            if (!href) throw new Error(`no page ${index}`);
            const drawing = await drawDesignedPage(designedBook, href, into, await sizeOf(index));
            if (!alive()) drawing.release();
            return drawing;
        } catch (error) {
            log.warn(`[Reader] page ${index + 1} of ${file.path} could not be drawn: ${error instanceof Error ? error.message : String(error)}`);
            if (alive()) {
                into.empty();
                into.createDiv({ cls: c("reader-designed-failed"), text: t("reader_source_designed_failed") });
            }
            return null;
        }
    };

    return {
        async pages(sides: ReturnType<typeof spreadSide>[]): Promise<SourcePages> {
            const first = await sizeOf(0);
            return {
                count: hrefs.length,
                first,
                size: sizeOf,
                label: (index) => String(index + 1),
                mount(index, into) {
                    let gone = false;
                    let drawing: DesignedDrawing | null = null;
                    const promise = drawInto(index, into, () => !gone).then((drawn) => {
                        drawing = drawn;
                    });
                    return {
                        promise,
                        cancel() {
                            gone = true;
                            drawing?.release();
                        },
                    };
                },
                spreads: (landscape, explicit) => pairSpreads(sides, { direction: book.pkg.direction ?? "ltr", spread: book.pkg.rendition?.spread ?? "auto", landscape, explicit }),
                ...(book.pkg.direction === "rtl" ? { direction: "rtl" as const } : {}),
                links: async () => [],
                destination: async () => null,
            };
        },
        async drawInColumn(index: number, body: HTMLElement, component: Component): Promise<DrawnChapter> {
            const size = await sizeOf(index);
            const fit = body.createDiv({ cls: c("reader-designed-fit") });
            fit.setCssProps({ "--zf-fxl-ratio": `${size.width} / ${size.height}` });
            let gone = false;
            component.register(() => {
                gone = true;
            });
            const drawing = await drawInto(index, fit, () => !gone);
            if (drawing) component.register(() => drawing.release());
            // Fitted to the column's width, and again whenever the column changes (#771 FR-5).
            const refit = () => fit.setCssProps({ "--zf-fxl-scale": String(Math.round(((fit.clientWidth || size.width) / size.width) * 100000) / 100000) });
            refit();
            const Observer = (body.win as (Window & { ResizeObserver?: typeof ResizeObserver }) | undefined)?.ResizeObserver;
            if (Observer) {
                const observer = new Observer(() => refit());
                observer.observe(fit);
                component.register(() => observer.disconnect());
            }
            return { words: 0, picture: true, designed: true };
        },
        close(): void {
            fonts.close();
        },
    };
}
