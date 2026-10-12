import { TFile, type App } from "obsidian";
import { articleFields, webSource } from "application/library/article";
import type { CiteSource } from "application/library/citation";
import { bookNoteOf } from "./bookNoteIndex";

/**
 * **What a citation is drawn from** (#768, epic #742): read from the metadata cache, never from a file,
 * and never written. A book or a paper: its book's note (#743), found by its link to the book wherever
 * it is kept. An article (#744): its own frontmatter. Nothing else — a field that is not there is not
 * looked up anywhere (no ISBN or DOI lookup, no network), and is left out of the citation.
 *
 * The Reader's *Cite* and the Library's *Cite this book* both read it, and both open the one panel
 * (`readerCite.ts`).
 */
export function citeSourceOf(app: App, path: string, format: "epub" | "pdf" | "article", fileTitle: string): CiteSource {
    if (format === "article") {
        const file = app.vault.getAbstractFileByPath(path);
        const frontmatter = file instanceof TFile ? app.metadataCache.getFileCache?.(file)?.frontmatter : undefined;
        const fields = articleFields(frontmatter);
        const url = webSource(frontmatter?.source);
        return {
            kind: "article",
            fileTitle,
            details: fields.details,
            ...(url ? { url } : {}),
            ...(fields.created !== undefined ? { created: fields.created } : {}),
        };
    }
    const note = bookNoteOf(app, path);
    return { kind: format === "epub" ? "book" : "paper", fileTitle, ...(note ? { details: note.details } : {}) };
}
