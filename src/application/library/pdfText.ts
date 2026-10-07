/**
 * **The text of a PDF page** (#680, #681, epic #675) — pure, over the runs pdf.js reads off a page.
 *
 * A PDF has no paragraphs: it has runs of glyphs placed on a page. To read a paper in the Reader's
 * own column — your font, your size, your theme — the runs are put back into **lines** (by where
 * they sit), the lines into **paragraphs** (by the gaps between them, an indented first line, a
 * short last one), and a line set larger than the body is taken for a **heading**. A word broken
 * across lines with a hyphen is joined again; a lone page number is left out. A page in two columns
 * is read one column, then the other.
 *
 * A scanned PDF is pictures of pages: pdf.js finds no text on them, so there is nothing to select
 * and nothing to highlight. The owner asked that this be said **before** you open it (2026-10-06),
 * so the shelf samples the first pages when it draws the cover and remembers the answer.
 */

/** How many pages are sampled to decide a PDF has no text. */
export const IMAGE_ONLY_SAMPLE = 3;

/**
 * Fewer letters than this across the sampled pages is a scan: a page number or a stray running
 * head is not text you can read, and a real page of prose has hundreds.
 */
export const IMAGE_ONLY_LETTERS = 24;

/** Whether the sampled pages' text says the PDF is made of images. */
export function isImageOnly(pageTexts: readonly string[]): boolean {
    if (pageTexts.length === 0) return false;
    const letters = pageTexts.join("").replace(/[^\p{L}]/gu, "").length;
    return letters < IMAGE_ONLY_LETTERS;
}

/** One run of text, where pdf.js put it: `x`, `y` from the bottom left, in page units. */
export interface TextRun {
    str: string;
    x: number;
    y: number;
    /** The run's font size, roughly. */
    size: number;
    width: number;
}

export interface PageBlock {
    kind: "heading" | "paragraph";
    text: string;
}

interface Line {
    x: number;
    y: number;
    size: number;
    right: number;
    text: string;
}

/** A pdf.js text item as a run: its place from `transform`, its size from the glyph scale. */
export function runOf(item: { str: string; transform: number[]; width: number; height?: number }): TextRun {
    const [a, b, , d, e, f] = item.transform;
    const size = Math.abs(d) || Math.hypot(a, b) || item.height || 10;
    return { str: item.str, x: e, y: f, size, width: item.width };
}

function median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((p, q) => p - q);
    return sorted[Math.floor(sorted.length / 2)];
}

/** Runs into lines, top to bottom: runs on the same baseline (within half a size) are one line. */
function linesOf(runs: readonly TextRun[]): Line[] {
    const sorted = runs.filter((run) => run.str.length > 0).sort((p, q) => q.y - p.y || p.x - q.x);
    const lines: { y: number; size: number; runs: TextRun[] }[] = [];
    for (const run of sorted) {
        const line = lines.find((candidate) => Math.abs(candidate.y - run.y) <= Math.max(candidate.size, run.size) * 0.5);
        if (line) {
            line.runs.push(run);
            line.size = Math.max(line.size, run.size);
        } else lines.push({ y: run.y, size: run.size, runs: [run] });
    }
    const out: Line[] = [];
    for (const line of lines.sort((p, q) => q.y - p.y)) {
        const parts = [...line.runs].sort((p, q) => p.x - q.x);
        let segment: Line | null = null;
        for (const part of parts) {
            // A gap of several letters on one baseline is a gutter: two columns, not one line.
            if (segment && part.x - segment.right > part.size * 3) {
                out.push(segment);
                segment = null;
            }
            if (!segment) {
                segment = { x: part.x, y: line.y, size: line.size, right: part.x + part.width, text: part.str };
                continue;
            }
            // A gap wider than a fifth of the size between two runs is a space nobody typed.
            if (!/\s$/.test(segment.text) && !/^\s/.test(part.str) && part.x - segment.right > part.size * 0.2) segment.text += " ";
            segment.text += part.str;
            segment.right = part.x + part.width;
        }
        if (segment) out.push(segment);
    }
    return out
        .map((line) => ({ ...line, text: line.text.replace(/\s+/g, " ").trim() }))
        .filter((line) => line.text.length > 0);
}

/**
 * Whether the page is set in two columns: a fair share of its lines start past the middle, and
 * lines are narrower than half the page.
 */
function columnSplit(lines: readonly Line[]): number | null {
    if (lines.length < 8) return null;
    const left = Math.min(...lines.map((line) => line.x));
    const right = Math.max(...lines.map((line) => line.right));
    const middle = (left + right) / 2;
    const narrow = lines.filter((line) => line.right - line.x < (right - left) * 0.55).length;
    const second = lines.filter((line) => line.x > middle - (right - left) * 0.05).length;
    return narrow >= lines.length * 0.7 && second >= lines.length * 0.25 ? middle - (right - left) * 0.05 : null;
}

const ENDS_SENTENCE = /[.!?:;…"”’)]$/;

/** Join two lines of one paragraph: a hyphen broken across them is mended. */
function join(text: string, next: string): string {
    if (/[a-zà-ÿ]-$/i.test(text) && /^[a-zà-ÿ]/.test(next)) return text.slice(0, -1) + next;
    return `${text} ${next}`;
}

/** Lines into paragraphs and headings, in reading order. */
function blocksOf(lines: readonly Line[]): PageBlock[] {
    if (lines.length === 0) return [];
    const body = median(lines.flatMap((line) => Array.from({ length: Math.max(1, Math.round(line.text.length / 10)) }, () => line.size)));
    const left = median(lines.map((line) => line.x));
    const widest = Math.max(...lines.map((line) => line.right - line.x));
    const gaps: number[] = [];
    for (let i = 1; i < lines.length; i++) {
        const gap = lines[i - 1].y - lines[i].y;
        if (gap > 0 && Math.abs(lines[i].size - body) < body * 0.15) gaps.push(gap);
    }
    const leading = median(gaps) || body * 1.2;

    const blocks: PageBlock[] = [];
    let current: { kind: PageBlock["kind"]; text: string } | null = null;
    let previous: Line | null = null;
    for (const line of lines) {
        const heading = line.size >= body * 1.2 && line.text.length <= 140;
        const kind: PageBlock["kind"] = heading ? "heading" : "paragraph";
        let breaks = !current || current.kind !== kind;
        if (!breaks && previous) {
            const gap = previous.y - line.y;
            const indented = line.x - left > body * 1.2 && line.x - previous.x > body * 0.8;
            const shortBefore = previous.right - previous.x < widest * 0.72 && ENDS_SENTENCE.test(previous.text);
            breaks = gap > leading * 1.45 || gap < 0 || (kind === "paragraph" && (indented || shortBefore));
        }
        if (breaks) {
            if (current) blocks.push(current);
            current = { kind, text: line.text };
        } else if (current) {
            current.text = join(current.text, line.text);
        }
        previous = line;
    }
    if (current) blocks.push(current);
    // A page number, a lone running number: not text anyone reads.
    return blocks.filter((block) => !/^\s*[-–]?\s*\d{1,4}\s*[-–]?\s*$/.test(block.text));
}

/** A page's runs as paragraphs and headings, in the order you would read them. */
export function reflowPage(runs: readonly TextRun[]): PageBlock[] {
    const lines = linesOf(runs);
    const split = columnSplit(lines);
    if (split === null) return blocksOf(lines);
    // Full-width lines (a title across both columns) read first; then each column, top to bottom.
    const spanning = lines.filter((line) => line.x < split && line.right > split + (line.right - line.x) * 0.2);
    const rest = lines.filter((line) => !spanning.includes(line));
    return [
        ...blocksOf(spanning),
        ...blocksOf(rest.filter((line) => line.x < split)),
        ...blocksOf(rest.filter((line) => line.x >= split)),
    ];
}

/** The words on a page, for the minutes it takes. */
export function pageText(blocks: readonly PageBlock[]): string {
    return blocks.map((block) => block.text).join("\n");
}
