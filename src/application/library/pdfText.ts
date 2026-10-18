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
    /** Set in a monospace face (#837): pdf.js's `styles[fontName].fontFamily`. */
    mono?: boolean;
    /** pdf.js's name for the run's font, when it gave one. */
    font?: string;
}

/**
 * What a block of a page is (epic #836). A **listing** is code (#837). The other kinds are filled in
 * by the slices after it.
 */
export type BlockKind = "heading" | "paragraph" | "listing" | "item" | "quote" | "footnote";

/** A format inside a block's words (epic #836): `code` here, the others by the slices after it. */
export type SpanKind = "code" | "strong" | "em" | "sup" | "link";

/** A format over `[start, end)` of a block's `text`: it marks characters, it never moves one. */
export interface InlineSpan {
    kind: SpanKind;
    start: number;
    end: number;
}

export interface PageBlock {
    kind: BlockKind;
    /**
     * Its characters. A page's blocks joined with nothing between them are the page's text: what the
     * highlighter, search and Page view read. Formats only cut it and mark it (#836 FR-1); a listing
     * alone has its own whitespace, its lines and their indentation.
     */
    text: string;
    spans?: InlineSpan[];
}

/** How a page is reflowed (epic #836). */
export interface ReflowOptions {
    /**
     * The whole document is set in a monospace face (#837 FR-6): a typewritten paper. Its pages
     * read as prose, as before; nothing in it is taken for code.
     */
    typewritten?: boolean;
}

interface Line {
    x: number;
    y: number;
    size: number;
    right: number;
    text: string;
    /** The run each character of `text` came from; `null` for a space nobody typed. */
    src: (TextRun | null)[];
    /** The runs of the line, left to right. */
    parts: TextRun[];
}

/** pdf.js's `styles` map, as far as a run's face goes. */
export type PdfStyles = Record<string, { fontFamily?: string } | undefined>;

/** A pdf.js text item as a run: its place from `transform`, its size from the glyph scale. */
export function runOf(item: { str: string; transform: number[]; width: number; height?: number; fontName?: string }, styles?: PdfStyles): TextRun {
    const [a, b, , d, e, f] = item.transform;
    const size = Math.abs(d) || Math.hypot(a, b) || item.height || 10;
    const run: TextRun = { str: item.str, x: e, y: f, size, width: item.width };
    if (item.fontName && styles) {
        run.font = item.fontName;
        if (styles[item.fontName]?.fontFamily === "monospace") run.mono = true;
    }
    return run;
}

/** A share of the sampled letters set in monospace at or above this is a typewritten document (#837). */
export const TYPEWRITTEN_SHARE = 0.9;

/**
 * Whether a document is typewritten (#837 FR-6): nearly every letter of its first pages is set in a
 * monospace face. It is the document's body face that decides, so a paper's one page of listing is
 * still code.
 */
export function isTypewritten(pages: readonly (readonly TextRun[])[]): boolean {
    let letters = 0;
    let mono = 0;
    for (const runs of pages) {
        for (const run of runs) {
            const count = run.str.replace(/[^\p{L}]/gu, "").length;
            letters += count;
            if (run.mono) mono += count;
        }
    }
    return letters >= IMAGE_ONLY_LETTERS && mono / letters >= TYPEWRITTEN_SHARE;
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
    const append = (segment: Line, text: string, from: TextRun | null) => {
        segment.text += text;
        for (let i = 0; i < text.length; i++) segment.src.push(from);
    };
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
                segment = { x: part.x, y: line.y, size: line.size, right: part.x + part.width, text: "", src: [], parts: [part] };
                append(segment, part.str, part);
                continue;
            }
            // A gap wider than a fifth of the size between two runs is a space nobody typed.
            if (!/\s$/.test(segment.text) && !/^\s/.test(part.str) && part.x - segment.right > part.size * 0.2) append(segment, " ", null);
            append(segment, part.str, part);
            segment.parts.push(part);
            segment.right = part.x + part.width;
        }
        if (segment) out.push(segment);
    }
    return out.map(tidy).filter((line) => line.text.length > 0);
}

/** A line's whitespace folded to single spaces and trimmed, each character keeping its run. */
function tidy(line: Line): Line {
    let text = "";
    const src: (TextRun | null)[] = [];
    for (let i = 0; i < line.text.length; i++) {
        const char = line.text[i];
        if (/\s/.test(char)) {
            if (text.length === 0 || text.endsWith(" ")) continue;
            text += " ";
        } else text += char;
        src.push(line.src[i]);
    }
    if (text.endsWith(" ")) {
        text = text.slice(0, -1);
        src.pop();
    }
    return { ...line, text, src };
}

/** A line of code (#837 FR-2): every run on it that has letters is set in monospace. */
function isCodeLine(line: Line): boolean {
    const inked = line.parts.filter((part) => part.str.trim().length > 0);
    return inked.length > 0 && inked.every((part) => part.mono);
}

/** The ranges of a line set in monospace inside prose (#837 FR-5): inline code. */
function codeSpansOf(line: Line): InlineSpan[] {
    const spans: InlineSpan[] = [];
    let start = -1;
    let end = -1;
    for (let i = 0; i <= line.text.length; i++) {
        const char = line.text[i];
        const blank = char !== undefined && /\s/.test(char);
        if (char !== undefined && (blank || line.src[i]?.mono)) {
            if (!blank) {
                if (start < 0) start = i;
                end = i + 1;
            }
            continue;
        }
        if (start >= 0) spans.push({ kind: "code", start, end });
        start = -1;
    }
    return spans;
}

/** The width of one monospace character on the lines: what a column of indentation is. */
function advanceOf(lines: readonly Line[]): number {
    const widths = lines.flatMap((line) => line.parts.filter((part) => part.mono && part.str.length > 0).map((part) => part.width / part.str.length));
    return median(widths) || (lines[0]?.size ?? 10) * 0.6;
}

/**
 * A listing's text (#837 FR-3, FR-4): its lines, each on its own, indented by where it starts and
 * the spaces it was set with, the spaces inside a line kept as wide as they were printed.
 */
function listingText(lines: readonly Line[]): string {
    const advance = advanceOf(lines);
    const left = Math.min(...lines.map((line) => line.x));
    return lines
        .map((line) => {
            let text = "";
            let right: number | null = null;
            for (const part of line.parts) {
                if (right !== null) {
                    const columns = Math.round((part.x - right) / advance);
                    if (columns > 0) text += " ".repeat(columns);
                }
                text += part.str;
                right = part.x + part.width;
            }
            const lead = text.length - text.trimStart().length;
            const indent = Math.max(0, Math.round((line.x - left) / advance)) + lead;
            return " ".repeat(indent) + text.trim();
        })
        .join("\n");
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

/** Whether two lines of one paragraph join by mending a hyphen broken across them. */
function mends(text: string, next: string): boolean {
    return /[a-zà-ÿ]-$/i.test(text) && /^[a-zà-ÿ]/.test(next);
}

/** A block being built: its text, its formats, and — for a listing — its lines, set when it ends. */
interface Draft {
    kind: BlockKind;
    text: string;
    spans: InlineSpan[];
    lines: Line[];
}

/** A line's formats, moved to where its text starts in the block. */
function spansAt(line: Line, kind: BlockKind, at: number, options: ReflowOptions): InlineSpan[] {
    if (kind !== "paragraph" || options.typewritten) return [];
    return codeSpansOf(line).map((span) => ({ ...span, start: span.start + at, end: span.end + at }));
}

/** A draft as the block it is: a listing's text is its lines; formats a space apart are one. */
function finish(draft: Draft): PageBlock {
    const text = draft.kind === "listing" ? listingText(draft.lines) + draft.text : draft.text;
    const spans: InlineSpan[] = [];
    for (const span of draft.spans) {
        const last = spans[spans.length - 1];
        if (last && last.kind === span.kind && text.slice(last.end, span.start).trim() === "") last.end = span.end;
        else spans.push({ ...span });
    }
    return spans.length > 0 ? { kind: draft.kind, text, spans } : { kind: draft.kind, text };
}

/**
 * Lines into blocks, in reading order. **Today's paragraphs are decided first**, by the same rules as
 * always; a format may only cut one further (#836 FR-1). Where it cuts what today joined with a space,
 * the space stays — at the end of the block before — so the page's text is the same, and a highlight
 * made before the format still finds its words. A listing alone has its own whitespace (#837).
 */
function blocksOf(lines: readonly Line[], options: ReflowOptions = {}): PageBlock[] {
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
    const isHeading = (line: Line) => line.size >= body * 1.2 && line.text.length <= 140;

    const blocks: PageBlock[] = [];
    let current: Draft | null = null;
    let previous: Line | null = null;
    for (const line of lines) {
        const heading = isHeading(line);
        // Today's kind, and whether today's rules start a new paragraph here.
        const today = heading ? "heading" : "paragraph";
        let todayBreaks = !previous || isHeading(previous) !== heading;
        if (!todayBreaks && previous) {
            const gap = previous.y - line.y;
            const indented = line.x - left > body * 1.2 && line.x - previous.x > body * 0.8;
            const shortBefore = previous.right - previous.x < widest * 0.72 && ENDS_SENTENCE.test(previous.text);
            todayBreaks = gap > leading * 1.45 || gap < 0 || (today === "paragraph" && (indented || shortBefore));
        }
        const kind: BlockKind = heading ? "heading" : !options.typewritten && isCodeLine(line) ? "listing" : "paragraph";
        let breaks = !current || current.kind !== kind;
        if (!breaks && previous) {
            // A listing keeps its lines together through one blank line (#837 FR-3); prose breaks as today.
            const gap = previous.y - line.y;
            breaks = kind === "listing" ? gap < 0 || gap > Math.max(previous.size, line.size) * 3.2 : todayBreaks;
        }
        if (!current || breaks) {
            if (current) {
                // Today these lines were one paragraph: the space between them stays, on the block before.
                if (!todayBreaks && !mends(current.text, line.text)) current.text += " ";
                blocks.push(finish(current));
            }
            current = { kind, text: kind === "listing" ? "" : line.text, spans: spansAt(line, kind, 0, options), lines: [line] };
        } else if (kind === "listing") {
            current.lines.push(line);
        } else {
            const mend = mends(current.text, line.text);
            const base = mend ? current.text.slice(0, -1) : `${current.text} `;
            for (const span of current.spans) span.end = Math.min(span.end, base.length);
            current.spans.push(...spansAt(line, kind, base.length, options));
            current.text = base + line.text;
        }
        previous = line;
    }
    if (current) blocks.push(finish(current));
    // A page number, a lone running number: not text anyone reads — and never a line of code.
    return blocks.filter((block) => block.kind === "listing" || !/^\s*[-–]?\s*\d{1,4}\s*[-–]?\s*$/.test(block.text));
}

/** A page's runs as blocks — headings, paragraphs and the formats a page keeps — in reading order. */
export function reflowPage(runs: readonly TextRun[], options: ReflowOptions = {}): PageBlock[] {
    const lines = linesOf(runs);
    const split = columnSplit(lines);
    if (split === null) return blocksOf(lines, options);
    // Full-width lines (a title across both columns) read first; then each column, top to bottom.
    const spanning = lines.filter((line) => line.x < split && line.right > split + (line.right - line.x) * 0.2);
    const rest = lines.filter((line) => !spanning.includes(line));
    return [
        ...blocksOf(spanning, options),
        ...blocksOf(rest.filter((line) => line.x < split), options),
        ...blocksOf(rest.filter((line) => line.x >= split), options),
    ];
}

/** The words on a page, for the minutes it takes. */
export function pageText(blocks: readonly PageBlock[]): string {
    return blocks.map((block) => block.text).join("\n");
}

/** A block of this many words or fewer is a fragment: a form's label, a caption, a cell (#813 FR-21). */
export const FRAGMENT_WORDS = 6;

/** Sampled pages whose blocks are at least this share fragments read best as printed (#813 FR-21). */
export const FORM_FRAGMENT_SHARE = 0.5;

/** Fewer words than this on an average sampled page: a layout of figures, not prose (#813 FR-21). */
export const SPARSE_PAGE_WORDS = 60;

/** Fewer blocks than this across the sample is too little to tell: it reads reflowed, as before. */
export const MIN_SAMPLE_BLOCKS = 8;

/** What a reflowed page is made of (#813 FR-21): its words, its blocks, and how many are fragments. */
export function pageShape(blocks: readonly PageBlock[]): { words: number; blocks: number; fragments: number } {
    let words = 0;
    let fragments = 0;
    for (const block of blocks) {
        const count = block.text.split(/\s+/).filter(Boolean).length;
        words += count;
        if (count <= FRAGMENT_WORDS) fragments++;
    }
    return { words, blocks: blocks.length, fragments };
}

/**
 * **The view a PDF reads best in** (#813 FR-20, FR-21): as printed (`page`) when its sampled pages
 * are mostly fragments — a form — or carry little text — figures and layout; reflowed (`reading`)
 * when they are prose. Pure and deterministic; nothing sampled is prose, as before.
 */
export function suggestPdfView(pages: readonly (readonly PageBlock[])[]): "page" | "reading" {
    const shapes = pages.map(pageShape).filter((shape) => shape.blocks > 0);
    if (shapes.length === 0) return "reading";
    const words = shapes.reduce((sum, shape) => sum + shape.words, 0) / shapes.length;
    const blocks = shapes.reduce((sum, shape) => sum + shape.blocks, 0);
    if (blocks < MIN_SAMPLE_BLOCKS) return "reading";
    const fragments = shapes.reduce((sum, shape) => sum + shape.fragments, 0);
    return fragments / blocks >= FORM_FRAGMENT_SHARE || words < SPARSE_PAGE_WORDS ? "page" : "reading";
}
