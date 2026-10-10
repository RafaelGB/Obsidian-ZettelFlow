/**
 * Footnotes read in place, and a way back after any jump (#718, epic #723).
 *
 * Pure: what counts as a note link, what a note says, and where you were. The Reader draws the
 * popover and the back pill; nothing here touches the DOM beyond reading the nodes it is handed.
 */

/** What a link tells about itself: its text, the book's own note flag, and whether it is raised. */
export interface LinkFacts {
    text: string;
    /** `data-zf-noteref`: the book marked it `epub:type="noteref"` / `role="doc-noteref"`. */
    noteref: boolean;
    /** Inside a `<sup>`: how most books without semantics write a footnote mark. */
    inSup: boolean;
}

/** `1`, `12`, `[3]`, `(4)`, `*`, `†`, `‡`, `§`, a lone letter — the marks footnotes are written with. */
const NOTE_MARK = /^[[(]?(\d{1,3}|[*†‡§¶]{1,3}|[a-z]|[ivx]{1,4})[\])]?$/i;

export function isNoteLink(link: LinkFacts): boolean {
    if (link.noteref || link.inSup) return true;
    return NOTE_MARK.test(link.text.trim());
}

/** Just what the excerpt reads of a node; an `HTMLElement` is one. */
export interface NoteNode {
    tagName?: string;
    textContent: string | null;
    getAttribute(name: string): string | null;
    parentElement: NoteNode | null;
}

/** A target shorter than this is a marker (a backlink, an anchor), not the note itself. */
const MARKER_CHARS = 4;
/** A container longer than this is the chapter around the note, not the note. */
const NOTE_MAX_CHARS = 2000;
/** How far up from a marker the note may be. */
const CLIMB = 3;

function textOf(el: NoteNode): string {
    return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

function cap(text: string, max: number): string {
    return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * What the note says, for the popover — or `null`, and the link jumps instead. A flagged note is
 * read whole; a bare marker (the link named the `<a id>` inside the note) climbs to the note that
 * holds it, but never to the chapter around it.
 */
export function noteExcerpt(target: NoteNode, max = 1200): string | null {
    let el: NoteNode | null = target;
    for (let step = 0; el && step <= CLIMB; step++) {
        const text = textOf(el);
        if (el.getAttribute("data-zf-note") === "true") return text ? cap(text, max) : null;
        if (text.length > NOTE_MAX_CHARS) return null;
        if (text.length >= MARKER_CHARS) return cap(text, max);
        el = el.parentElement;
    }
    return null;
}

/**
 * What took you away from a place (#761 FR-6): a link in the book, a Contents entry, a search hit,
 * *Go to note* in a footnote, a bookmark, or a passage opened from Think or *This note*.
 */
export const TRAIL_REASONS = ["link", "contents", "search", "note", "bookmark", "passage"] as const;
export type TrailReason = (typeof TRAIL_REASONS)[number];

/** How many places the trail keeps; the oldest is forgotten first (FR-9). */
export const TRAIL_LIMIT = 20;

/**
 * **Where you've been** (#718, grown up in #761): the places you left before each jump, newest last.
 * One trail for the back pill, Alt+← and the *Where you've been* list (FR-8). Per reading; never saved.
 */
export class ReaderTrail<T> {
    private readonly items: T[] = [];

    constructor(private readonly limit = TRAIL_LIMIT) {}

    get size(): number {
        return this.items.length;
    }

    push(item: T): void {
        this.items.push(item);
        if (this.items.length > this.limit) this.items.shift();
    }

    /** The newest place: where one step back lands. */
    peek(): T | undefined {
        return this.items[this.items.length - 1];
    }

    /** One step back: the newest place, taken off the trail. */
    pop(): T | undefined {
        return this.items.pop();
    }

    /** The places, newest first, as the list shows them. */
    list(): T[] {
        return [...this.items].reverse();
    }

    /** Go back to the `index`-th place of `list()`: it alone leaves the trail (FR-8). */
    takeAt(index: number): T | undefined {
        if (!(index >= 0 && index < this.items.length)) return undefined;
        return this.items.splice(this.items.length - 1 - index, 1)[0];
    }

    clear(): void {
        this.items.length = 0;
    }
}
