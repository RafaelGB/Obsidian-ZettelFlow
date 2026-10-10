import type { App, TFile } from "obsidian";
import { log } from "architecture";
import { isImageOnly, IMAGE_ONLY_SAMPLE } from "application/library/pdfText";
import type { SourceFacts, SourceFormat } from "application/library/sourceMeta";
import { declared, isTextItem, openPdf } from "./sources/pdfjs";
import { imageType, openEpub } from "./sources/epub";
import { tooLarge } from "architecture/components/core/reader/readerDevice";

/**
 * **Covers that look like the thing** (#680, epic #675): the EPUB's own cover, the PDF's first page.
 *
 * A cover is drawn the first time a card scrolls into view and **kept for the session only**, in
 * memory: never in the source file (L5), never in the vault (a folder of thumbnails would be
 * clutter you did not ask for), never in plugin data (five hundred images in `data.json` would
 * make every settings save slow). What is cheap to keep is kept — the title, the author, the page
 * count and whether a PDF is only images — in plugin data, so the shelf knows them before it draws.
 *
 * Reading a cover is also when a PDF is sampled for text (owner, 2026-10-06): a scan says so on
 * its card before you open it.
 */

export interface CoverRead {
    /** An object URL for the cover, or `null` when the source has none that can be drawn. */
    url: string | null;
    facts: SourceFacts;
}

/** The width a cover is drawn at, in CSS pixels at 2× — sharp on a card, small in memory. */
const COVER_WIDTH = 320;

/** How many covers are kept before the oldest is let go. */
const CACHE_LIMIT = 300;

const cache = new Map<string, CoverRead>();
let queue: Promise<unknown> = Promise.resolve();

const keyOf = (file: TFile) => `${file.path}@${file.stat.mtime}:${file.stat.size}`;

/** The cover already read for this file, if any. */
export function cachedCover(file: TFile): CoverRead | undefined {
    return cache.get(keyOf(file));
}

/**
 * Read a source's cover and facts — one at a time, so a shelf of PDFs never renders twenty pages
 * at once. Never throws: a source that cannot be read gets the drawn cover and its file's name.
 */
export function readCover(app: App, file: TFile, format: SourceFormat): Promise<CoverRead> {
    const key = keyOf(file);
    const known = cache.get(key);
    if (known) return Promise.resolve(known);
    const run = queue.then(async () => {
        const again = cache.get(key);
        if (again) return again;
        let read: CoverRead;
        // A source the device could not hold is not read for its cover either: the drawn cover (#750).
        if (tooLarge(file.stat?.size, format)) {
            read = { url: null, facts: { chapters: 0 } };
            remember(key, read);
            return read;
        }
        try {
            read = format === "pdf" ? await pdfCover(app, file) : await epubCover(app, file);
        } catch (error) {
            log.debug(`[Library] no cover for ${file.path}: ${error instanceof Error ? error.message : String(error)}`);
            read = { url: null, facts: { chapters: 0 } };
        }
        remember(key, read);
        return read;
    });
    queue = run.catch(() => undefined);
    return run;
}

function remember(key: string, read: CoverRead): void {
    cache.set(key, read);
    while (cache.size > CACHE_LIMIT) {
        const oldest = cache.keys().next().value as string;
        const url = cache.get(oldest)?.url;
        if (url) URL.revokeObjectURL(url);
        cache.delete(oldest);
    }
}

/** Let every cover go — the plugin is unloading. */
export function clearCoverCache(): void {
    for (const read of cache.values()) if (read.url) URL.revokeObjectURL(read.url);
    cache.clear();
    queue = Promise.resolve();
}

async function pdfCover(app: App, file: TFile): Promise<CoverRead> {
    const doc = await openPdf(app, file);
    try {
        const info: Record<string, unknown> = (await doc.getMetadata().catch(() => ({ info: {} }))).info ?? {};
        const samples: string[] = [];
        for (let n = 1; n <= Math.min(IMAGE_ONLY_SAMPLE, doc.numPages); n++) {
            const page = await doc.getPage(n);
            const content = await page.getTextContent();
            samples.push(content.items.filter(isTextItem).map((item) => item.str).join(""));
        }
        const first = await doc.getPage(1);
        const base = first.getViewport({ scale: 1 });
        const viewport = first.getViewport({ scale: COVER_WIDTH / Math.max(1, base.width) });
        // Never attached: it is drawn once, read as an image and let go.
        const canvas = createEl("canvas", { attr: { width: Math.round(viewport.width), height: Math.round(viewport.height) } });
        const context = canvas.getContext("2d");
        let url: string | null = null;
        if (context) {
            await first.render({ canvasContext: context, viewport }).promise;
            const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
            if (blob) url = URL.createObjectURL(blob);
        }
        return {
            url,
            facts: {
                chapters: doc.numPages,
                ...(declared(info.Title) ? { title: declared(info.Title) } : {}),
                ...(declared(info.Author) ? { author: declared(info.Author) } : {}),
                ...(isImageOnly(samples) ? { imageOnly: true } : {}),
            },
        };
    } finally {
        void doc.destroy().catch(() => undefined);
    }
}

async function epubCover(app: App, file: TFile): Promise<CoverRead> {
    const book = await openEpub(app, file);
    const facts: SourceFacts = {
        chapters: book.pkg.spine.length,
        ...(book.pkg.title ? { title: book.pkg.title } : {}),
        ...(book.pkg.author ? { author: book.pkg.author } : {}),
    };
    const href = book.pkg.coverHref;
    const bytes = href ? await book.archive.bytes(href) : null;
    if (!href || !bytes) return { url: null, facts };
    return { url: URL.createObjectURL(new Blob([bytes as BlobPart], { type: imageType(book, href) })), facts };
}
