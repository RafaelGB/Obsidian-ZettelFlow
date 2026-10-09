/**
 * **The language of what you are reading** (#757 FR-6, FR-7) — pure. The reading column declares
 * it, so the platform hyphenates (and spells, and speaks) the words by the book's own rules, not by
 * Obsidian's: a Spanish book in an English Obsidian breaks *re-pre-sen-ta-ción* the Spanish way.
 *
 * An EPUB says it in its package, and a chapter or a passage may say its own; a PDF may declare one.
 * A PDF that declares none and a note reading declare nothing, and inherit Obsidian's — as before.
 */

import { languageTag } from "application/library/sourceMeta";

export { languageTag };

export interface ReadingLanguageInput {
    format: "epub" | "pdf" | "note";
    /** The book's: an EPUB's `dc:language`, a PDF's declared `/Lang`. */
    bookLanguage?: string;
    /** A chapter's own (`<html lang>` / `<body xml:lang>`), which wins for that chapter. */
    chapterLanguage?: string;
}

/** The tag the column declares, or `null` to declare nothing and keep Obsidian's (AC-3). */
export function readingLanguage(input: ReadingLanguageInput): string | null {
    if (input.format === "note") return null;
    return languageTag(input.chapterLanguage) ?? languageTag(input.bookLanguage) ?? null;
}

/** A language's name in the interface's language, from the platform (FR-12); the tag when unknown. */
export function languageName(tag: string, uiLocale: string): string {
    try {
        const names = new Intl.DisplayNames([uiLocale], { type: "language", fallback: "none" });
        return names.of(tag) ?? tag;
    } catch {
        return tag;
    }
}
