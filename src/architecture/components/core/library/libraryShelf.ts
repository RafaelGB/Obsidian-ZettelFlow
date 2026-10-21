import { TFile, type App } from "obsidian";
import { log } from "architecture";
import { KnowledgeIndex } from "architecture/knowledge";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import { bornCounts, notesBornFrom } from "application/library/born";
import { buildShelf, type ShelfArticle, type ShelfItem } from "application/library/shelf";
import { ARTICLES_DEFAULT, articleAdded, articleFields, articlesFolder, isArticle } from "application/library/article";
import type { BookNoteEntry } from "application/library/bookNote";
import { normalizeLibrary, sourceFormat, type LibraryMeta } from "application/library/sourceMeta";
import { normalizeSaved } from "architecture/components/core/reader/readerSaved";
import { normalizeResume, readingKey, resumeOf } from "architecture/components/core/reader/readerResume";
import type { LibraryHost } from "./libraryHost";
import { gatherBookNotes } from "./bookNoteIndex";

/**
 * The Library's one impure step (#680): read what the shelf is built from — the PDFs and EPUBs in
 * the vault, the articles in the articles folder (#744), what plugin data remembers about them,
 * the saved readings and where each was left, the highlight counts (from the metadata cache) and
 * the notes citing each source (from the model) — and hand it to the pure shelf. Reads only.
 */
export interface Shelf {
    items: ShelfItem[];
    /** The notes citing each source, by path. */
    born: Map<string, string[]>;
    meta: LibraryMeta;
    /** The book notes (#743), by the source each links to. */
    notes: Map<string, BookNoteEntry>;
}

/** Every PDF and EPUB in the vault. */
export function sourceFiles(app: App): TFile[] {
    return app.vault.getFiles().filter((file) => file instanceof TFile && sourceFormat(file.path) !== null);
}

/** The articles folder as the setting holds it (#744): Web Clipper's `Clippings` until you choose; empty is off. */
export function articlesFolderOf(host: LibraryHost | null | undefined): string {
    const raw = host?.settings?.articlesFolder;
    return articlesFolder(raw === undefined ? ARTICLES_DEFAULT : raw);
}

/**
 * Every article in the vault (#744 FR-1): the notes in the articles folder whose `source` is a web
 * address, with what their frontmatter says — from the metadata cache, never a file read (AC-8).
 */
export function gatherArticles(app: App, folder: string): ShelfArticle[] {
    if (!folder) return [];
    const out: ShelfArticle[] = [];
    const prefix = `${folder}/`;
    for (const file of app.vault.getMarkdownFiles?.() ?? []) {
        if (!file.path.startsWith(prefix)) continue;
        const fm = app.metadataCache.getFileCache?.(file)?.frontmatter;
        if (!isArticle(file.path, fm, folder)) continue;
        const fields = articleFields(fm);
        out.push({
            path: file.path,
            basename: file.name,
            details: fields.details,
            ...(fields.host ? { host: fields.host } : {}),
            added: articleAdded(fields.created, file.stat?.ctime),
        });
    }
    return out;
}

/** The shelf item a link that is not a PDF or an EPUB stands for: an article, by its path (#744 FR-7). */
export function articleResolver(articles: readonly ShelfArticle[]): (ref: string) => string | null {
    const paths = new Set(articles.map((article) => article.path));
    return (ref) => (paths.has(ref) ? ref : paths.has(`${ref}.md`) ? `${ref}.md` : null);
}

/**
 * What lies in a folder the archive keeps (#865 FR-12): its PDFs and EPUBs and its articles, as shelf
 * items — however they got there. From the vault's list and the metadata cache, never a file read.
 */
export function gatherArchived(app: App, host: LibraryHost | null, folder: string): ShelfItem[] {
    if (!folder) return [];
    const prefix = `${folder}/`;
    return buildShelf({
        sources: sourceFiles(app)
            .filter((file) => file.path.startsWith(prefix))
            .map((file) => ({ path: file.path, basename: file.name, ...(file.stat?.ctime ? { added: file.stat.ctime } : {}) })),
        articles: gatherArticles(app, folder),
        meta: normalizeLibrary(host?.settings?.library),
        saved: [],
        highlights: new Map(),
        born: new Map(),
        notes: gatherBookNotes(app),
    });
}

export function gatherShelf(app: App, host: LibraryHost | null): Shelf {
    const settings = host?.settings;
    const meta = normalizeLibrary(settings?.library);
    const saved = normalizeSaved(settings?.readerSaved);
    const resume = normalizeResume(settings?.readerResume);
    const pathPlaces = new Map<string, { chapter: number; total: number; at: number }>();
    for (const entry of saved) {
        const place = resumeOf(resume, readingKey("selection", entry.seed, entry.paths));
        if (place) pathPlaces.set(entry.id, place);
    }
    let highlights = new Map<string, number>();
    try {
        highlights = ThoughtStore.getInstance().highlightCounts();
    } catch (error) {
        log.debug(`[Library] no highlight counts: ${String(error)}`);
    }
    const notes = gatherBookNotes(app);
    // A book's note is the book, never a note born from it (#743 FR-12).
    const bookNotes = new Set([...notes.values()].map((note) => note.path));
    const articles = gatherArticles(app, articlesFolderOf(host));
    const index = KnowledgeIndex.getInstance();
    const born = index.status === "ready" ? notesBornFrom(index.getModel().all(), bookNotes, articleResolver(articles)) : new Map<string, string[]>();
    const items = buildShelf({
        sources: sourceFiles(app).map((file) => ({ path: file.path, basename: file.name, ...(file.stat?.ctime ? { added: file.stat.ctime } : {}) })),
        articles,
        meta,
        saved,
        pathPlaces,
        highlights,
        born: bornCounts(born),
        notes,
    });
    return { items, born, meta, notes };
}
