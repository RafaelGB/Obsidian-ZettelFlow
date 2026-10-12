/**
 * **What survived?** (#755, epic #742) — when the end of a chapter pauses, pure, no `obsidian`.
 *
 * At the end of a chapter worth pausing at, the book gives you a blank leaf: what you marked in it,
 * what it touched in your vault, and one question. This module decides *whether* a turn pauses; the
 * leaf itself is `readerSurvivedLeaf.ts`. Nothing here counts for you, scores or remembers beyond the
 * one skip rule (FR-7), and nothing here writes.
 */

/** A real chapter is at least this long in words (FR-2.2): a cover or a title page never is. */
export const SURVIVED_MIN_WORDS = 1500;
/** A PDF section is a chapter from this many pages (FR-2.2). */
export const SURVIVED_MIN_PAGES = 3;
/** How long the Reader must have been on the chapter in this sitting (FR-2.3). */
export const SURVIVED_MIN_MS = 120_000;
/** Leaving the leaf sooner than this, untouched, is a skip (FR-7). */
export const SURVIVED_SKIP_MS = 4_000;

/** How a turn came about. Only `read` — a reading turn forward — may ever pause (FR-2.1). */
export type TurnHow = "read" | "back" | "jump" | "search" | "resume" | "deeplink";

/**
 * One chapter, as the end of it is decided: the Reader's chapters it runs over (`start`–`end`, both
 * in), how long it is — in words for an EPUB, in pages for a PDF — and how it is named.
 */
export interface ChapterSpan {
    start: number;
    end: number;
    /** An EPUB's spine item: its words, once it has been drawn. */
    words?: number;
    /** A PDF's outline section: how many pages it runs over. */
    pages?: number;
    /** A PDF section's own name (the kicker); an EPUB chapter is named by its number. */
    title?: string;
}

/** What `chapterEnds` reads of a source: its format, how many chapters it has, and its outline. */
export interface ChapterEndsInput {
    format: "pdf" | "epub" | "article" | "path";
    chapters: number;
    toc: readonly { title: string; chapter: number; depth: number }[];
    /** An EPUB chapter's words, when it has been drawn. */
    words?: (index: number) => number | undefined;
}

/**
 * Where a source's chapters begin and end (FR-1, AC-2). An EPUB's chapter is a spine item; a PDF's is
 * a top-level (depth-0) section of its outline, from its first page to the page before the next one.
 * A PDF without an outline has no chapters to end, and neither has an article or a path.
 */
export function chapterEnds(input: ChapterEndsInput): ChapterSpan[] {
    if (input.format === "epub") {
        return Array.from({ length: input.chapters }, (_, i) => {
            const words = input.words?.(i);
            return { start: i, end: i, ...(words !== undefined ? { words } : {}) };
        });
    }
    if (input.format !== "pdf") return [];
    const starts = new Map<number, string>();
    for (const entry of input.toc) {
        if (entry.depth !== 0 || entry.chapter < 0 || entry.chapter >= input.chapters) continue;
        // Two entries on one page: the first names it.
        if (!starts.has(entry.chapter)) starts.set(entry.chapter, entry.title);
    }
    const sorted = [...starts].sort((a, b) => a[0] - b[0]);
    return sorted.map(([start, title], i) => {
        const end = i + 1 < sorted.length ? sorted[i + 1][0] - 1 : input.chapters - 1;
        return { start, end, pages: end - start + 1, title };
    });
}

/** The chapter the Reader's chapter `index` sits in, or `null` (a PDF's front matter, before its outline). */
export function spanOf(ends: readonly ChapterSpan[], index: number): ChapterSpan | null {
    return ends.find((span) => span.start <= index && index <= span.end) ?? null;
}

/** The chapter a turn from `from` to `to` ends, when it ends one: `from` its last, `to` past it. */
export function endingAt(ends: readonly ChapterSpan[], from: number, to: number): ChapterSpan | null {
    if (to !== from + 1) return null;
    const span = spanOf(ends, from);
    return span && span.end === from ? span : null;
}

/** Why a turn did or did not pause: one reason, the first condition that kept it away. */
export type PauseReason = "pause" | "how" | "no-chapter" | "short" | "unread" | "unmarked" | "last" | "skipped" | "listening" | "off";

export interface PauseFacts {
    how: TurnHow;
    /** The chapter this turn ends, or `null` when it ends none. */
    end: ChapterSpan | null;
    /** Whether that chapter is the source's last (FR-2.5): the book's end card has that place. */
    last: boolean;
    /** How long the Reader was on that chapter in this sitting, in ms (FR-2.3). */
    sittingMs: number;
    /** How many marks of yours are in it, from any sitting (FR-2.4): highlights, margin notes, ink. */
    marks: number;
    /** The last pause was skipped (FR-7). */
    skipPending: boolean;
    /** Listen is reading the book aloud (#765, FR-2.7). */
    listening: boolean;
    /** *Pause at chapter ends* (FR-8). */
    enabled: boolean;
}

export interface PauseDecision {
    pause: boolean;
    reason: PauseReason;
    /**
     * Whether the skip pending is spent: this end would have paused, and did not because the last
     * one was skipped. The one after it may pause again (FR-7).
     */
    spendSkip: boolean;
}

/** Whether a chapter is long enough to pause at (FR-2.2). An EPUB's words not known yet: not yet. */
export function realChapter(span: ChapterSpan): boolean {
    if (span.pages !== undefined) return span.pages >= SURVIVED_MIN_PAGES;
    return (span.words ?? 0) >= SURVIVED_MIN_WORDS;
}

/**
 * The rule of FR-2 (AC-1): a turn pauses only when every one of its eight conditions holds. The first
 * that does not is the reason. The switch and listening come first: they say no before anything is read.
 */
export function shouldPause(facts: PauseFacts): PauseDecision {
    const no = (reason: PauseReason): PauseDecision => ({ pause: false, reason, spendSkip: false });
    if (!facts.enabled) return no("off");
    if (facts.listening) return no("listening");
    if (facts.how !== "read") return no("how");
    if (!facts.end) return no("no-chapter");
    if (facts.last) return no("last");
    if (!realChapter(facts.end)) return no("short");
    if (facts.sittingMs < SURVIVED_MIN_MS) return no("unread");
    if (facts.marks <= 0) return no("unmarked");
    if (facts.skipPending) return { pause: false, reason: "skipped", spendSkip: true };
    return { pause: true, reason: "pause", spendSkip: false };
}

/** Whether leaving the leaf was a skip (FR-7, AC-3): sooner than four seconds, and untouched. */
export function wasSkip(arrivedAt: number, leftAt: number, touched: boolean): boolean {
    return !touched && leftAt - arrivedAt < SURVIVED_SKIP_MS;
}

/**
 * **The time this sitting spent on each chapter** (FR-2.3), in memory only: the clock runs for the
 * chapter on screen while the Reader is visible, and stops while it is hidden — a locked iPad, another
 * tab. Chapters are keyed by their span's start. Nothing is kept past the view.
 */
export class SittingClock {
    private readonly spent = new Map<number, number>();
    private on: number | null = null;
    private since = 0;
    private visible = true;

    constructor(private readonly now: () => number) {}

    /** The chapter on screen changed (or `null`: none that counts — the end card, a leaf). */
    at(key: number | null): void {
        if (key === this.on) return;
        this.flush();
        this.on = key;
        this.since = this.now();
    }

    /** The Reader was hidden or shown again. */
    setVisible(visible: boolean): void {
        if (visible === this.visible) return;
        this.flush();
        this.visible = visible;
        this.since = this.now();
    }

    /** How long this sitting has been on chapter `key`, now included. */
    total(key: number): number {
        const kept = this.spent.get(key) ?? 0;
        if (key !== this.on || !this.visible) return kept;
        return kept + Math.max(0, this.now() - this.since);
    }

    private flush(): void {
        const now = this.now();
        if (this.on !== null && this.visible) this.spent.set(this.on, (this.spent.get(this.on) ?? 0) + Math.max(0, now - this.since));
        this.since = now;
    }
}

/** What `touchedNotes` reads: the chapter's keys, and the three ways a note of yours meets it. */
export interface TouchedInput {
    /** The chapter keys the chapter runs over (an EPUB spine item's path, a PDF's `page:<n>`). */
    keys: ReadonlySet<string>;
    /** The notes born from the source, each with the chapter keys its `source` names in it. */
    born: readonly { path: string; cites: readonly string[] }[];
    /** The notes the chapter's marks link to. */
    linked: readonly string[];
    /** The notes opened as a peek from the chapter in this sitting. */
    peeked: readonly string[];
    /** Never a note it touched: the source itself, a book's note (#743). */
    exclude: ReadonlySet<string>;
}

/**
 * **It touched** (FR-3): the notes of yours you crystallized from this chapter, linked from its marks,
 * or opened from it as a peek — each once, in that order. Read off citations and links; nothing is
 * inferred from text, and nothing is proposed (§XII).
 */
export function touchedNotes(input: TouchedInput): string[] {
    const out = new Set<string>();
    const add = (path: string) => {
        if (path && !input.exclude.has(path)) out.add(path);
    };
    for (const note of input.born) if (note.cites.some((key) => input.keys.has(key))) add(note.path);
    for (const path of input.linked) add(path);
    for (const path of input.peeked) add(path);
    return [...out];
}
