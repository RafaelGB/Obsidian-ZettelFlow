/**
 * How far through a chapter you are, and how long is left (#667) — pure, so the bar's numbers are
 * testable without a layout.
 */

/** A comfortable reading pace for prose; the bar says "about", never a promise. */
export const WORDS_PER_MINUTE = 220;

/** Past this share of the page, the chapter counts as read to the end. */
export const END_OF_CHAPTER = 0.98;

/** Words in a chapter's text — runs of letters or digits, in any script. */
export function wordCount(text: string): number {
    return text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

/** Minutes a number of words takes, never less than one when there is anything to read. */
export function minutesFor(words: number, wpm = WORDS_PER_MINUTE): number {
    return words <= 0 ? 0 : Math.max(1, Math.ceil(words / wpm));
}

/**
 * The share of a scroller read so far: 0 at the top, 1 at the bottom. A page that fits on screen
 * has nothing to scroll, so it is "at the top" until you turn it — not read the moment it opens.
 */
export function readFraction(scrollTop: number, scrollHeight: number, clientHeight: number): number {
    const room = (scrollHeight || 0) - (clientHeight || 0);
    if (!(room > 0)) return 0;
    return Math.max(0, Math.min(1, scrollTop / room));
}

/** Whether there is anything below the fold at all. */
export function scrolls(scrollHeight: number, clientHeight: number): boolean {
    return (scrollHeight || 0) - (clientHeight || 0) > 1;
}

/** Minutes left in a chapter of `words`, `fraction` of the way through; 0 at the end. */
export function minutesLeft(words: number, fraction: number): number {
    if (fraction >= END_OF_CHAPTER) return 0;
    return minutesFor(Math.round(words * (1 - fraction)));
}
