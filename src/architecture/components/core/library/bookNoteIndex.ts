import type { App, CachedMetadata, TFile } from "obsidian";
import { BOOK_LINK_KEY, indexBookNotes, linkTarget, type BookNoteEntry } from "application/library/bookNote";

/**
 * **Where each book's note is** (#743 FR-1) — read from the metadata cache, never from a file
 * (AC-8), and never from the folder a note is in: a note left by an earlier *Book notes folder*, or
 * adopted from anywhere, belongs to its book because its `book` key links it.
 *
 * The one read every later slice uses: the shelf, the detail, *This note* — and citations (#768)
 * and *what it produced* (#752), which ask a book for its note, or a note for its book.
 */

/** The link a note's `book` key holds, as the metadata cache read it. */
function bookLinkOf(cache: CachedMetadata | null | undefined): string | null {
    const fm = cache?.frontmatter;
    if (!fm || !(BOOK_LINK_KEY in fm)) return null;
    const link = cache.frontmatterLinks?.find((entry) => entry.key === BOOK_LINK_KEY || entry.key.startsWith(`${BOOK_LINK_KEY}.`))?.link;
    return (link ?? linkTarget(fm[BOOK_LINK_KEY]))?.split("#")[0] ?? null;
}

/** Every book's note in the vault, by the book (its vault path) each one links to. */
export function gatherBookNotes(app: App): Map<string, BookNoteEntry> {
    const entries: { path: string; source: string; frontmatter: unknown }[] = [];
    const cache = app.metadataCache;
    for (const file of app.vault.getMarkdownFiles?.() ?? []) {
        const meta = cache.getFileCache?.(file);
        const link = bookLinkOf(meta);
        if (!link) continue;
        const book = cache.getFirstLinkpathDest?.(link, file.path);
        if (book) entries.push({ path: file.path, source: book.path, frontmatter: meta?.frontmatter });
    }
    return indexBookNotes(entries);
}

/** The note of one book, when it has one. */
export function bookNoteOf(app: App, sourcePath: string): BookNoteEntry | null {
    return gatherBookNotes(app).get(sourcePath) ?? null;
}

/** The book a note is the note of — its vault path — or `null` when the note is not a book's note. */
export function bookOfNote(app: App, file: TFile): string | null {
    const link = bookLinkOf(app.metadataCache.getFileCache?.(file));
    return link ? (app.metadataCache.getFirstLinkpathDest?.(link, file.path)?.path ?? null) : null;
}
