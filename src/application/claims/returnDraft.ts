/**
 * The draft lives outside the DOM (#562 FR-7).
 *
 * The Lab learned this the hard way: a refuge that loses what you typed because something
 * re-rendered is not one. Here the risk is different and worse — the return is a modal, and the
 * most natural thing to do halfway through answering is to go and look at the note. Closing must
 * cost nothing.
 *
 * So the half-sentence is held here, keyed by note, until an answer is actually committed. In
 * memory on purpose: a draft that outlived a reload would be a second, invisible copy of something
 * you never decided to keep.
 */
const drafts = new Map<string, string>();

/** Hold what has been typed for this note. An empty draft is forgotten rather than stored blank. */
export function keepDraft(path: string, text: string): void {
    if (text.trim().length === 0) {
        drafts.delete(path);
        return;
    }
    drafts.set(path, text);
}

/** What was being typed for this note, or nothing. */
export function readDraft(path: string): string {
    return drafts.get(path) ?? "";
}

/** Forget it — called when an answer is committed, never when a return is closed. */
export function clearDraft(path: string): void {
    drafts.delete(path);
}
