import type { App, Component, TFile } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { titleFromName } from "application/library/shelf";
import { fragmentOf, spineIndexOf } from "application/library/epubPackage";
import { bodyOf, chapterLanguage, sanitizeChapter, type ChapterBuilder, type SourceNode } from "application/library/epubSanitize";
import { MATH_NS, SVG_NS } from "application/library/epubForeign";
import { MOTION } from "architecture/components/core/reader/readerMotion";
import { domParse, imageType, openEpub } from "./epub";
import type { DrawnChapter, SourceDocument, SourceTocEntry } from "./sourceDocument";

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
    const chapters = spine.map((_, i) => ({ label: titles[i] ?? t("reader_source_chapter", String(i + 1)) }));
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
        ...(book.pkg.direction === "rtl" ? { direction: "rtl" as const } : {}),
        ...(book.pkg.language ? { language: book.pkg.language } : {}),
        async draw(index: number, body: HTMLElement, component: Component): Promise<DrawnChapter> {
            const href = spine[index]?.href;
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
            const language = chapterLanguage(root);
            return { words: text.split(/\s+/).filter(Boolean).length, picture: false, ...(language ? { language } : {}) };
        },
        resolveLink(_from: number, href: string) {
            const [path] = href.split("#");
            const chapter = spineIndexOf(spine, path);
            if (chapter < 0) return null;
            const fragment = fragmentOf(href);
            return { chapter, ...(fragment ? { fragment } : {}) };
        },
        close(): void {
            // The archive is in memory and goes with the reading; nothing to close.
        },
    };
}
