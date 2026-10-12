import type { Crystallization } from "application/thinking/crystallize";
import { sourceEntry, sourceTitle } from "./provenance";
import { sourceFormat } from "./sourceMeta";

/**
 * **Recall's note** (#760, epic #742) — pure, no `obsidian`.
 *
 * Recall asks for a chapter in your own words, without the chapter or your marks in front of you.
 * What you wrote can be kept as a note, and this is that note: **your words exactly as you typed
 * them** — never corrected, completed or rephrased (§XII), only the trailing whitespace let go — and
 * one `source::` line, so the Library counts the note as born from the book (#683). Nothing of the
 * book is in it that you did not type yourself: the citation names the chapter, never a passage.
 */

/** The chapter recalled, as the citation names it. */
export interface RecallChapter {
    /** The vault path of the book, the paper or the article. */
    file: string;
    /** The chapter's identity in the file (`SourceChapter.key`): a spine item, `page:<n>` for a PDF. */
    chapter?: string;
    /** How the book names it: `3 · The lazy controller`, a paper's section, an article's heading. */
    label: string;
    /** The print page it begins on, only when the source declares one. */
    page?: string;
    /** The title the file declares, for the link's alias. */
    bookTitle?: string;
}

/** Your words as they are kept: byte for byte, only what trails them let go (AC-3). */
export function recallWords(text: string): string {
    return text.replace(/\s+$/u, "");
}

/**
 * The citation (FR-6): through #751's one producer for a PDF or an EPUB — the chapter as the place,
 * no quote — and, for an article (#744), the clipping linked as a note with its section, the way a
 * highlight of it is cited.
 */
export function recallCitation(at: RecallChapter): string {
    if (sourceFormat(at.file)) {
        return sourceEntry(
            { file: at.file, ...(at.chapter ? { chapter: at.chapter } : {}), label: at.label, ...(at.page ? { page: at.page } : {}) },
            at.bookTitle?.trim() || sourceTitle(at.file)
        );
    }
    const where = at.label.replace(/[[\]|]/g, " ").replace(/\s+/g, " ").trim();
    return `[[${at.file.replace(/\.md$/i, "")}]]${where ? ` ${where}` : ""}`;
}

/** The note, exactly as it is written and as its preview shows it (FR-6). */
export function renderRecallNote(words: string, citation: string): string {
    return `${recallWords(words)}\n\nsource:: ${citation}\n`;
}

/**
 * The same note as a crystallize flow takes it (#712): no thought behind it, so nothing frozen and no
 * passage to cite in its properties — only your words and the `source::` line.
 */
export function recallPlan(title: string, words: string, citation: string): Crystallization {
    return { title, body: recallWords(words), bornFrom: [], frozen: [], omitted: 0, sources: [citation], quotes: [], places: [] };
}
