/**
 * **One progress signal** (#812 FR-15 to FR-19): what the Reader says about where you are, decided
 * here and drawn by the view. Pure: no DOM, no settings — so each rule is one test.
 */

/** A reading of more chapters than this has no dots: the bar's line says where you are (FR-16). */
export const DOTS_MAX = 12;

/** Whether a reading of `total` chapters shows its dots, whatever it reads (FR-16, decision 1). */
export function showDots(total: number): boolean {
    return total > 1 && total <= DOTS_MAX;
}

/** How far a chapter has been read, said quietly in Contents — never as a number (FR-13). */
export type ChapterState = "read" | "part" | "unread";

/**
 * A chapter's state from what is already kept (decision 2): before the place you are, read; the
 * place itself, part-read; one you opened this sitting, part-read at least; one already kept as read
 * to its end, read; the rest unread.
 */
export function chapterState(index: number, current: number, visited: ReadonlySet<number> = new Set(), ended = false, read: ReadonlySet<number> = new Set()): ChapterState {
    if (ended || index < current || read.has(index)) return "read";
    if (index === current || visited.has(index)) return "part";
    return "unread";
}

/**
 * Letters and digits only, lower case, no accents, no spaces: how two titles are compared — a
 * heading broken over two lines (`01<br/>Principios básicos`) reads as its title.
 */
function plain(text: string): string {
    return text
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * What the line above the text says (FR-15, decision 5): the chapter's title — nothing when it has
 * none, and nothing when the chapter opens with its own heading that already says it.
 */
export function kickerTitle(title: string | null | undefined, firstHeading = ""): string {
    const name = (title ?? "").trim();
    if (!name) return "";
    const heading = plain(firstHeading);
    if (heading && (heading.includes(plain(name)) || plain(name).includes(heading))) return "";
    return name;
}

/** Which screen of the chapter is on show in pages (FR-18): `null` when the chapter fits one. */
export function screenPart(view: number, views: number): { at: number; of: number } | null {
    if (views <= 1) return null;
    return { at: Math.min(Math.max(0, view), views - 1) + 1, of: views };
}
