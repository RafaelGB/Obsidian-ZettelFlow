/**
 * **The words of a printed page** (#746 FR-9, epic #740) — pure.
 *
 * Page view draws a PDF's page as a picture: it has no text layer, so nothing on it can be selected.
 * A highlight stroke there still needs the words under it. They come from the page's own text runs
 * (pdf.js `getTextContent`): each run is split into words, each word given a box — as **fractions of
 * the page** as drawn, so it holds through every zoom — and an offset into **the same text the Reading
 * view reflows that page into** (`reflowPage`). A quote made over a printed page is therefore found
 * again in the Reading view, and the other way round.
 *
 * Offsets are found, never guessed: each printed line is looked for in the reflowed text, word by
 * word. A line that cannot be found (a running head, a page number, a rotated label) gives no words,
 * and a stroke over it stays ink — never a highlight of the wrong words (#746 Risk 4).
 */

import { reflowPage, runOf, type PageBlock } from "./pdfText";

/** A pdf.js text item, as far as words need it. */
export interface PdfWordItem {
    str: string;
    transform: number[];
    width: number;
    height?: number;
}

/** A word on a printed page: where it is (fractions of the page) and where it is in the page's text. */
export interface PageWord {
    start: number;
    end: number;
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface PageText {
    /** The page's text as the Reading view draws it: its blocks, joined as the chapter's text nodes are. */
    text: string;
    words: PageWord[];
    /** Where each heading block starts in `text`: what a passage is cited under. */
    headings: { at: number; text: string }[];
}

/** A page with fewer letters than this is read as a picture, in both views. */
export const PAGE_WORD_LETTERS = 24;

/** The page as drawn: its size, and how a rectangle in PDF space lands on it (rotation included). */
export interface PageGeometry {
    width: number;
    height: number;
    toViewport(rect: number[]): number[];
}

interface Glyphs {
    text: string;
    /** The left and right edge of each character, in PDF units. */
    xs: [number, number][];
    y: number;
    size: number;
}

/** Whether a run is upright: a rotated or skewed run is a label, not a line of the text. */
function upright(transform: number[]): boolean {
    const [a, b, c, d] = transform;
    return Math.abs(b) < 1e-6 && Math.abs(c) < 1e-6 && a > 0 && d > 0;
}

/** The runs as printed lines, with each character's place — the same joins `reflowPage` makes. */
function linesOf(items: readonly PdfWordItem[]): Glyphs[] {
    const runs = items
        .filter((item) => item.str.length > 0 && upright(item.transform))
        .map((item) => runOf(item))
        .sort((p, q) => q.y - p.y || p.x - q.x);
    const lines: { y: number; size: number; runs: typeof runs }[] = [];
    for (const run of runs) {
        const line = lines.find((candidate) => Math.abs(candidate.y - run.y) <= Math.max(candidate.size, run.size) * 0.5);
        if (line) {
            line.runs.push(run);
            line.size = Math.max(line.size, run.size);
        } else lines.push({ y: run.y, size: run.size, runs: [run] });
    }
    const out: Glyphs[] = [];
    for (const line of lines.sort((p, q) => q.y - p.y)) {
        let segment: Glyphs | null = null;
        let right = 0;
        for (const part of [...line.runs].sort((p, q) => p.x - q.x)) {
            // A gutter: two columns on one baseline are two lines, as the reflow reads them.
            if (segment && part.x - right > part.size * 3) {
                out.push(segment);
                segment = null;
            }
            if (!segment) segment = { text: "", xs: [], y: line.y, size: line.size };
            else if (!/\s$/.test(segment.text) && !/^\s/.test(part.str) && part.x - right > part.size * 0.2) {
                segment.text += " ";
                segment.xs.push([right, part.x]);
            }
            const step = part.width / Math.max(1, part.str.length);
            for (let i = 0; i < part.str.length; i++) {
                segment.text += part.str[i];
                segment.xs.push([part.x + i * step, part.x + (i + 1) * step]);
            }
            right = part.x + part.width;
        }
        if (segment) out.push(segment);
    }
    return out;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The run of non-space characters of `text` around a found word: a word mended across a line is one
 * word. Blocks are joined with no space (as the chapter's text nodes are), so a block edge ends it too.
 */
function wordAround(text: string, start: number, end: number, edges: ReadonlySet<number>): [number, number] {
    let s = start;
    let e = end;
    while (s > 0 && !edges.has(s) && !/\s/.test(text[s - 1])) s--;
    while (e < text.length && !edges.has(e) && !/\s/.test(text[e])) e++;
    return [s, e];
}

/**
 * The words of a page: their boxes as fractions of the page as drawn, and their offsets in the text
 * the Reading view shows. An image-only page (or one that is a figure) has none.
 */
export function pageWordsOf(items: readonly PdfWordItem[], page: PageGeometry): PageText {
    const blocks: PageBlock[] = reflowPage(items.map((item) => runOf(item)));
    const headings: { at: number; text: string }[] = [];
    const edges = new Set<number>();
    let text = "";
    for (const block of blocks) {
        if (block.kind === "heading") headings.push({ at: text.length, text: block.text });
        edges.add(text.length);
        text += block.text;
    }
    if (text.replace(/[^\p{L}]/gu, "").length < PAGE_WORD_LETTERS) return { text, words: [], headings };

    const lines = linesOf(items);
    const total = lines.reduce((sum, line) => sum + line.text.length, 0) || 1;
    const taken: [number, number][] = [];
    const words: PageWord[] = [];
    const w = Math.max(1, page.width);
    const h = Math.max(1, page.height);
    let before = 0;
    for (const line of lines) {
        const tokens = [...line.text.matchAll(/\S+/g)];
        const expected = (before / total) * text.length;
        before += line.text.length;
        if (tokens.length === 0) continue;
        // A word broken at the line's end is mended in the reflowed text: look for its first half.
        const parts = tokens.map((token, i) => (i === tokens.length - 1 && /\p{L}-$/u.test(token[0]) ? token[0].slice(0, -1) : token[0]));
        const pattern = new RegExp(parts.map(escape).join("\\s+"), "gu");
        let best: RegExpExecArray | null = null;
        for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
            const end = match.index + match[0].length;
            if (taken.some(([s, e]) => match.index < e && end > s)) continue;
            if (!best || Math.abs(match.index - expected) < Math.abs(best.index - expected)) best = match;
        }
        if (!best) continue;
        taken.push([best.index, best.index + best[0].length]);
        // Each word, in order, inside the line's match.
        let cursor = best.index;
        tokens.forEach((token, i) => {
            const at = text.indexOf(parts[i], cursor);
            if (at < 0) return;
            cursor = at + parts[i].length;
            const [start, end] = wordAround(text, at, at + parts[i].length, edges);
            const first = line.xs[token.index ?? 0];
            const last = line.xs[(token.index ?? 0) + token[0].length - 1];
            if (!first || !last) return;
            const corners = page.toViewport([first[0], line.y - line.size * 0.25, last[1], line.y + line.size * 0.85]);
            const left = Math.min(corners[0], corners[2]);
            const top = Math.min(corners[1], corners[3]);
            words.push({ start, end, left: left / w, top: top / h, width: Math.abs(corners[2] - corners[0]) / w, height: Math.abs(corners[3] - corners[1]) / h });
        });
    }
    return { text, words, headings };
}

/** The heading a passage at `offset` sits under, as the Reading view's `headingAt` finds it. */
export function pageHeadingAt(page: PageText, offset: number): string | undefined {
    let found: string | undefined;
    for (const heading of page.headings) {
        if (heading.at > offset) break;
        found = heading.text.trim() || found;
    }
    return found;
}
