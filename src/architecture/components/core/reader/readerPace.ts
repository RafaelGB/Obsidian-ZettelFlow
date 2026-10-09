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
export function minutesLeft(words: number, fraction: number, wpm = WORDS_PER_MINUTE): number {
    if (fraction >= END_OF_CHAPTER) return 0;
    return minutesFor(Math.round(words * (1 - fraction)), wpm);
}

/**
 * Your own reading pace (#722): learned from the chapters you read to the end, on this device only,
 * never sent anywhere and never shown as a number to beat.
 */
export interface Pace {
    wpm: number;
    samples: number;
}

/** A chapter shorter than this says nothing about how fast you read. */
const MIN_SAMPLE_WORDS = 150;
/** Outside this, it was not reading: a tab left open, or a skim. */
const MIN_WPM = 80;
const MAX_WPM = 700;
/** How far one chapter moves the pace: gently, so one slow evening does not rewrite it. */
const LEARNING_RATE = 0.3;
/** Until then, the default: one chapter is an anecdote. */
const TRUSTED_AFTER = 2;

/** The pace after reading `words` in `ms`, or the same pace when that was not reading. */
export function learnPace(pace: Pace | null, sample: { words: number; ms: number }): Pace | null {
    if (sample.words < MIN_SAMPLE_WORDS || sample.ms <= 0) return pace;
    const wpm = sample.words / (sample.ms / 60_000);
    if (wpm < MIN_WPM || wpm > MAX_WPM) return pace;
    if (!pace) return { wpm, samples: 1 };
    const rate = pace.samples < TRUSTED_AFTER ? 0.5 : LEARNING_RATE;
    return { wpm: pace.wpm + (wpm - pace.wpm) * rate, samples: pace.samples + 1 };
}

/** Words per minute to count with: yours once there is enough to trust, the default until then. */
export function paceWpm(pace: Pace | null): number {
    return pace && pace.samples >= TRUSTED_AFTER ? Math.round(pace.wpm) : WORDS_PER_MINUTE;
}

/** Whatever was stored, as a pace — or none. */
export function normalizePace(raw: unknown): Pace | null {
    const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    const wpm = Number(value?.wpm);
    const samples = Number(value?.samples);
    return Number.isFinite(wpm) && wpm >= MIN_WPM && wpm <= MAX_WPM && Number.isInteger(samples) && samples > 0 ? { wpm, samples } : null;
}

/**
 * Minutes left in the book: what is left of this chapter, and the chapters after it — their words
 * when the book has been read through (a search does that), or the chapters you read so far, as an
 * average, otherwise.
 */
export function bookMinutesLeft(input: {
    chapterWordsLeft: number;
    upcoming: number[] | { chapters: number; averageWords: number };
    wpm: number;
}): number {
    const after = Array.isArray(input.upcoming)
        ? input.upcoming.reduce((sum, words) => sum + words, 0)
        : input.upcoming.chapters * input.upcoming.averageWords;
    const words = Math.max(0, input.chapterWordsLeft) + Math.max(0, after);
    return words <= 0 ? 0 : Math.max(1, Math.round(words / input.wpm));
}

/** A long time, as hours and minutes. */
export function splitMinutes(total: number): { hours: number; minutes: number } {
    return { hours: Math.floor(total / 60), minutes: total % 60 };
}

/** A designed page's pace until three pages have been read (#771, a spec gap settled): half a minute. */
export const DEFAULT_SECONDS_PER_PAGE = 30;
/** How many pages of this reading make its pace its own. */
const PAGES_TRUSTED_AFTER = 3;
/** A page left sooner than this was turned past, not read; longer, the tab was left open. */
const MIN_PAGE_MS = 1500;
const MAX_PAGE_MS = 10 * 60_000;

/**
 * How long a designed page takes you (#771 FR-8): the median of this reading's pages, once three have
 * been read, else the default. A median, so one page you stared at does not move it.
 */
export function pagePace(dwellsMs: readonly number[]): number {
    const read = dwellsMs.filter((ms) => ms >= MIN_PAGE_MS && ms <= MAX_PAGE_MS).sort((a, b) => a - b);
    if (read.length < PAGES_TRUSTED_AFTER) return DEFAULT_SECONDS_PER_PAGE;
    const mid = Math.floor(read.length / 2);
    const median = read.length % 2 === 1 ? read[mid] : (read[mid - 1] + read[mid]) / 2;
    return Math.round(median / 100) / 10;
}

/** Minutes left in a designed book: the pages left at that pace, never less than one while any are. */
export function minutesLeftByPages(pagesLeft: number, secondsPerPage: number): number {
    if (!(pagesLeft > 0)) return 0;
    return Math.max(1, Math.round((pagesLeft * Math.max(1, secondsPerPage)) / 60));
}
