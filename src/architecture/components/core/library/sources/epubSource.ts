import type { App, Component, TFile } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { titleFromName } from "application/library/shelf";
import { fragmentOf, spineIndexOf } from "application/library/epubPackage";
import { bodyOf, sanitizeChapter, type ChapterBuilder, type SourceNode } from "application/library/epubSanitize";
import { domParse, imageType, openEpub } from "./epub";
import type { DrawnChapter, SourceDocument, SourceTocEntry } from "./sourceDocument";

/** The clean chapter, built with Obsidian's own element helpers — never `innerHTML` (L4). */
const domBuilder: ChapterBuilder<HTMLElement> = {
    element(parent, tag, attrs) {
        const { ["data-zf-outlink"]: outlink, ...rest } = attrs;
        return parent.createEl(tag as keyof HTMLElementTagNameMap, {
            attr: rest,
            ...(outlink ? { cls: c("reader-source-outlink") } : {}),
        });
    },
    text(parent, text) {
        parent.appendText(text);
    },
};

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
                component.register(() => urls.forEach((url) => URL.revokeObjectURL(url)));
                for (const img of Array.from(body.querySelectorAll("img"))) {
                    const path = img.getAttribute("data-zf-src");
                    if (!path) continue;
                    try {
                        const bytes = await book.archive.bytes(path);
                        if (!bytes) continue;
                        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: imageType(book, path) }));
                        urls.push(url);
                        img.setAttribute("src", url);
                    } catch (error) {
                        log.debug(`[Reader] an image of ${file.path} cannot be read: ${String(error)}`);
                    }
                }
            }
            const text = body.textContent ?? "";
            return { words: text.split(/\s+/).filter(Boolean).length, picture: false };
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
