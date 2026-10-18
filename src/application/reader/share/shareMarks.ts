/**
 * **What goes on a shared copy, and where** (#842, epic #836) — pure.
 *
 * A PDF you marked is handed back as a new PDF with your marks on it. This decides which thoughts are
 * marks, where each lands on its printed page and what pdf.js is asked to write for it. The glue that
 * talks to pdf.js and the vault is `readerShareRun.ts`.
 *
 * **Where a highlight lands is read off the page, never off the screen.** Each marked page is read
 * again in the share's own document, its words placed by `pageWordsOf` in the page's own user space
 * (`page.view`, rotation 0). pdf.js gives text in user space whatever the page's `/Rotate`, so the
 * rotation never enters, and an offset box is just its own coordinates.
 */

import { anchorAll, type TextSpan } from "application/thinking/quoteAnchor";
import { isInk, type Thought } from "application/thinking/thought";
import { HIGHLIGHT_MEANINGS, meaningOf, type HighlightMeaning } from "application/thinking/highlightMeaning";
import { linesOf } from "application/reader/ink/strokeHighlight";
import { PAGE_WORD_LETTERS, type PageGeometry, type PageText } from "application/library/pdfWords";

/** The file's colours (FR-2): the copy is read outside your theme, so each meaning has one, fixed. */
export const SHARE_COLOURS: Record<HighlightMeaning, [number, number, number]> = {
    idea: [255, 255, 152],
    question: [128, 235, 255],
    quote: [83, 255, 188],
    discuss: [214, 184, 255],
};

/** The marks of a PDF that go on its copy (FR-5): highlights, and notes on a page with no passage. */
export interface ShareMarks {
    highlights: Thought[];
    notes: Thought[];
}

/**
 * The thoughts about a PDF that are marks on it. An ink note is its own (E2, #843); an accepted Reader
 * move (#756) is an answer, not a mark — neither is a highlight here.
 */
export function classifyMarks(thoughts: readonly Thought[]): ShareMarks {
    const highlights: Thought[] = [];
    const notes: Thought[] = [];
    for (const thought of thoughts) {
        if (thought.madeBy || isInk(thought) || !thought.locator) continue;
        if (thought.quote?.exact) highlights.push(thought);
        else if (thought.text.trim()) notes.push(thought);
    }
    return { highlights, notes };
}

/** The pages the marks are on, by index, in order: the only pages the share reads (FR-18). */
export function markedPages(marks: ShareMarks): number[] {
    return [...new Set([...marks.highlights, ...marks.notes].map((thought) => thought.locator!.at))].sort((p, q) => p - q);
}

/** A page's box in user space: `page.view`, `[x1, y1, x2, y2]`. */
export type PageBox = readonly [number, number, number, number];

/** The page's own space as the geometry `pageWordsOf` places words in: fractions map straight back. */
export function userSpaceGeometry(view: PageBox): PageGeometry {
    const [x1, y1, x2, y2] = view;
    return { width: x2 - x1, height: y2 - y1, toViewport: ([a, b, c, d]) => [a - x1, y2 - b, c - x1, y2 - d] };
}

/** One line of a highlight in user space: its quad (`TL TR BL BR`) and its outline. */
export interface HighlightLine {
    quad: number[];
    outline: number[];
}

/**
 * The highlights of one printed page, placed (FR-1): each passage found in the page's text — the
 * page folded once for all of them — and laid over the words it covers. One that cannot be found, or
 * a page with no words, is unplaced: counted, never guessed (FR-7).
 */
export function placeHighlights(page: PageText, view: PageBox, thoughts: readonly Thought[]): { placed: { thought: Thought; lines: HighlightLine[] }[]; unplaced: Thought[] } {
    const quoted = thoughts.filter((thought): thought is Thought & { quote: NonNullable<Thought["quote"]> } => Boolean(thought.quote));
    if (page.text.replace(/[^\p{L}]/gu, "").length < PAGE_WORD_LETTERS) return { placed: [], unplaced: [...thoughts] };
    const { anchored, detached } = anchorAll(page.text, quoted);
    const placed: { thought: Thought; lines: HighlightLine[] }[] = [];
    const unplaced: Thought[] = [...detached, ...thoughts.filter((thought) => !thought.quote)];
    for (const { span, ...thought } of anchored) {
        const lines = linesOver(page, view, span);
        if (lines) placed.push({ thought, lines });
        else unplaced.push(thought);
    }
    return { placed, unplaced };
}

/** One passage's lines on its printed page, or `null` when it cannot be placed. */
export function placeHighlight(page: PageText, view: PageBox, thought: Thought): HighlightLine[] | null {
    return placeHighlights(page, view, [thought]).placed[0]?.lines ?? null;
}

/**
 * A span's lines on its printed page: the words it covers, one quad per line, each the union of that
 * line's word boxes — as Page view draws it (#746).
 */
function linesOver(page: PageText, view: PageBox, span: TextSpan): HighlightLine[] | null {
    const words = page.words.filter((word) => word.start < span.end && word.end > span.start);
    if (words.length === 0) return null;
    const [x1, , x2, y2] = view;
    const w = x2 - x1;
    const h = y2 - view[1];
    const height = words.reduce((sum, word) => sum + word.height, 0) / words.length;
    return linesOf(words, height).map((line) => {
        const left = x1 + Math.min(...line.words.map((word) => word.left)) * w;
        const right = x1 + Math.max(...line.words.map((word) => word.left + word.width)) * w;
        const top = y2 - Math.min(...line.words.map((word) => word.top)) * h;
        const bottom = y2 - Math.max(...line.words.map((word) => word.top + word.height)) * h;
        return { quad: [left, top, right, top, left, bottom, right, bottom], outline: [left, top, right, top, right, bottom, left, bottom] };
    });
}

/** The box around everything in `lines`. */
function rectOf(lines: readonly HighlightLine[]): number[] {
    const xs = lines.flatMap((line) => [line.quad[0], line.quad[2]]);
    const ys = lines.flatMap((line) => [line.quad[1], line.quad[5]]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** pdf.js 5.3's editor types, as `AnnotationEditorType` names them. */
export const EDITOR = { FREETEXT: 3, HIGHLIGHT: 9, INK: 15 } as const;

/** What pdf.js is asked to write for a highlight (probed on Obsidian 1.14.4's pdf.js 5.3.34). */
export function highlightPayload(lines: readonly HighlightLine[], pageIndex: number, thought: Thought, user?: string): Record<string, unknown> {
    const meaning = meaningOf(thought);
    return {
        annotationType: EDITOR.HIGHLIGHT,
        color: SHARE_COLOURS[HIGHLIGHT_MEANINGS.includes(meaning) ? meaning : "idea"],
        opacity: 1,
        thickness: 12,
        quadPoints: new Float32Array(lines.flatMap((line) => line.quad)),
        outlines: lines.map((line) => new Float32Array(line.outline)),
        rect: rectOf(lines),
        rotation: 0,
        pageIndex,
        structTreeParentId: null,
        popupRef: "",
        ...(user ? { user } : {}),
    };
}

/** A margin note's size in the file: pdf.js draws a FreeText at this, and does not wrap it. */
export const NOTE_FONT = 10;
const NOTE_LINE = NOTE_FONT * 1.2;
/** The least room a margin needs to hold a note (FR-4); a narrower page takes the corner. */
const MARGIN_ROOM = 72;
const NOTE_INSET = 8;
const NOTE_WIDTH = 180;

/**
 * A note broken into lines that fit `width` points (Helvetica, about half an em a letter): pdf.js
 * breaks a FreeText only at `\n`. A word is never split unless it is wider than the line alone.
 */
export function wrapNote(text: string, width: number, size = NOTE_FONT): string[] {
    const fits = Math.max(1, Math.floor(width / (size * 0.5)));
    const out: string[] = [];
    for (const paragraph of text.split("\n")) {
        let line = "";
        for (const word of paragraph.split(/\s+/).filter(Boolean)) {
            let rest = word;
            while (rest.length > fits) {
                if (line) out.push(line);
                line = "";
                out.push(rest.slice(0, fits));
                rest = rest.slice(fits);
            }
            if (!line) line = rest;
            else if (line.length + 1 + rest.length <= fits) line += ` ${rest}`;
            else {
                out.push(line);
                line = rest;
            }
        }
        out.push(line);
    }
    return out;
}

/** A margin note, placed: its lines and its box in user space. */
export interface PlacedNote {
    lines: string[];
    rect: [number, number, number, number];
}

/**
 * Where a page's margin notes go (FR-4): down the wider side margin from the top of what is printed,
 * or — a page with no margin to speak of, or no words to measure it by — down from its top-right
 * corner, over the page. Always inside the page.
 */
export function placeNotes(view: PageBox, words: PageText["words"], texts: readonly string[]): PlacedNote[] {
    const [x1, y1, x2, y2] = view;
    const w = x2 - x1;
    const h = y2 - y1;
    let left = 0;
    let right = 0;
    let top = y2 - NOTE_INSET;
    let side: "left" | "right" | "corner" = "corner";
    if (words.length > 0) {
        const cx1 = x1 + Math.min(...words.map((word) => word.left)) * w;
        const cx2 = x1 + Math.max(...words.map((word) => word.left + word.width)) * w;
        left = cx1 - x1;
        right = x2 - cx2;
        top = y2 - Math.min(...words.map((word) => word.top)) * h;
        const wider = Math.max(left, right);
        if (wider >= MARGIN_ROOM) side = right >= left ? "right" : "left";
        else top = y2 - NOTE_INSET;
    }
    const width = side === "corner" ? Math.min(NOTE_WIDTH, w - 2 * NOTE_INSET) : Math.min(NOTE_WIDTH, (side === "right" ? right : left) - 2 * NOTE_INSET);
    const x = side === "left" ? x1 + NOTE_INSET : x2 - NOTE_INSET - width;
    const out: PlacedNote[] = [];
    for (const text of texts) {
        const lines = wrapNote(text, width);
        const height = lines.length * NOTE_LINE + NOTE_FONT * 0.4;
        let bottom = top - height;
        if (bottom < y1 + NOTE_INSET) {
            // Past the foot: what is left goes on from the top, over the page.
            top = y2 - NOTE_INSET;
            bottom = Math.max(y1 + NOTE_INSET, top - height);
        }
        out.push({ lines, rect: [x, bottom, x + width, top] });
        top = bottom - NOTE_FONT * 0.4;
    }
    return out;
}

/** What pdf.js is asked to write for a margin note: a FreeText, black, its author its own (FR-4). */
export function notePayload(note: PlacedNote, pageIndex: number, author?: string): Record<string, unknown> {
    return {
        annotationType: EDITOR.FREETEXT,
        color: [0, 0, 0],
        fontSize: NOTE_FONT,
        value: note.lines.join("\n"),
        pageIndex,
        rect: note.rect,
        rotation: 0,
        structTreeParentId: null,
        id: null,
        ...(author ? { user: author } : {}),
    };
}
