import type { Judgement } from "./Judgement";

/**
 * **Not related, for one chapter of one book** (#754 FR-9, AC-3) — the Reader's *Alongside* asks
 * you something about a tension: does this note bear on what you are reading? *Not related* is the
 * answer, and it is data (§XII): one rejected verdict in the judgement record, and nothing written
 * to any note.
 *
 * It holds for **one chapter**: a note can be beside the point in chapter 4 and central in chapter
 * 9. The subject carries the book and the chapter's key (#751), so a *whole book* verdict, if it is
 * ever asked for, is a second prefix rather than a migration. #756's *Reject* writes exactly this.
 *
 * Pure and Obsidian-free. Unmemoised on purpose, like `gapVerdict`: a history is not a cache key.
 */

/** What marks a judgement as an Alongside *Not related*. The book and the chapter follow it. */
export const CHAPTER_SUBJECT_PREFIX = "reader-not-related:";

/** The subject naming one chapter of one book: `reader-not-related:<book>#<chapter>`. */
export function chapterSubject(book: string, chapterKey: string): string {
    return `${CHAPTER_SUBJECT_PREFIX}${book}#${chapterKey}`;
}

/** The verdict recorded when you say a note is not related to this chapter. */
export function chapterVerdict(note: string, book: string, chapterKey: string): Omit<Judgement, "at"> {
    return { path: note, subject: chapterSubject(book, chapterKey), origin: "derived", verdict: "rejected" };
}

/**
 * The notes ruled out of one chapter. Only a well-formed, rejected entry with exactly this subject
 * counts; anything else — another verdict, another chapter, a record edited by hand — is ignored,
 * and this never throws.
 */
export function ruledOutInChapter(history: readonly Judgement[] | null | undefined, book: string, chapterKey: string): Set<string> {
    const out = new Set<string>();
    const list: readonly unknown[] = Array.isArray(history) ? (history as readonly unknown[]) : [];
    const subject = chapterSubject(book, chapterKey);
    for (const entry of list) {
        try {
            if (!entry || typeof entry !== "object") continue;
            const { verdict, subject: said, path } = entry as Partial<Record<"verdict" | "subject" | "path", unknown>>;
            if (verdict !== "rejected" || said !== subject || typeof path !== "string") continue;
            if (path.trim()) out.add(path.trim());
        } catch {
            // A hostile member is skipped.
        }
    }
    return out;
}
