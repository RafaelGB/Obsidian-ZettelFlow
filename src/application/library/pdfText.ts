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

import type { CropBox } from "./pdfCrop";
import { islandsOf, type Island, type IslandPage } from "./pdfIslands";

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
    /** Set in a bold or an italic face (#839): read off the font's real name. */
    bold?: boolean;
    italic?: boolean;
}

/**
 * What a block of a page is (epic #836). A **listing** is code (#837). The other kinds are filled in
 * by the slices after it.
 */
/**
 * What a block is. An `island` is a part of the page shown as printed — a table, a figure (#854): its
 * text is still the page's, read where it stands. A `rule` is a separator the page draws, and has none.
 */
export type BlockKind = "heading" | "paragraph" | "listing" | "item" | "quote" | "footnote" | "island" | "rule";

/** A format inside a block's words (epic #836): `code` here, the others by the slices after it. */
export type SpanKind = "code" | "strong" | "em" | "sup" | "link";

/** A format over `[start, end)` of a block's `text`: it marks characters, it never moves one. */
export interface InlineSpan {
    kind: SpanKind;
    start: number;
    end: number;
    /** Where a link goes (#840): a footnote on the page, by its id. */
    to?: LinkTo;
}

/** Where a link in a page goes: a footnote on it (#840), a place in the paper or an address out of it (#841). */
export type LinkTo = { note: string } | { dest: unknown } | { url: string };

export interface PageBlock {
    kind: BlockKind;
    /**
     * Its characters. A page's blocks joined with nothing between them are the page's text: what the
     * highlighter, search and Page view read. Formats only cut it and mark it (#836 FR-1); a listing
     * alone has its own whitespace, its lines and their indentation.
     */
    text: string;
    spans?: InlineSpan[];
    /** An item's depth in its list (#838): 0 is the outermost. */
    level?: number;
    /** How many characters of `text` are an item's marker and the space after it (#838). */
    marker?: number;
    /** An item of a numbered or lettered list (#838). */
    ordered?: boolean;
    /** A part of the item, quote or footnote above, that today was its own paragraph: drawn inside it, on its own line (#838, #840). */
    cont?: boolean;
    /** A footnote's id on its page (#840): what its marker opens. */
    id?: string;
    /** An island's crop (#854): its box on the page as shares, from the top-left; what it is; its height over its width. */
    box?: CropBox;
    island?: "table" | "figure";
    aspect?: number;
    /** An island's width in points, as printed: it is never drawn much larger than that. */
    points?: number;
}

/** How a page is reflowed (epic #836). */
export interface ReflowOptions {
    /**
     * The whole document is set in a monospace face (#837 FR-6): a typewritten paper. Its pages
     * read as prose, as before; nothing in it is taken for code.
     */
    typewritten?: boolean;
    /**
     * Headings and paragraphs only, as a page always read (#836 FR-11): what the view a PDF suggests is
     * decided on, so no format can move it.
     */
    plain?: boolean;
    /**
     * The document's furniture (#853): the lines its pages print at their top or foot, page after page
     * — a running head, a footer, *Página 14 de 30* — as `furnitureOf` found them, and where this page
     * sits (its box's bottom and height, in the runs' own space). They are left out.
     */
    furniture?: { keys: ReadonlySet<string>; bottom: number; height: number };
    /**
     * Where the page sits and what it prints besides its text (#854): with it, its tables and figures
     * are islands shown as printed, and its rules separators. Without it, the page reads as before.
     */
    page?: IslandPage;
}

/** A page's top and foot, as a share of its height: where furniture is printed, and only there. */
export const FURNITURE_ZONE = 0.12;
/** Furniture is printed on at least this many pages of those read. */
export const FURNITURE_PAGES = 3;

/**
 * A line as furniture would be known again (#853): which edge of the page, how far down it (to a
 * fiftieth of the page), and its text with any number standing for every number — so the footer of
 * page 14 is the footer of page 4. `null` for a line between the page's top and foot.
 */
function furnitureKey(line: { y: number; text: string }, bottom: number, height: number): string | null {
    const at = (line.y - bottom) / Math.max(1, height);
    const edge = at >= 1 - FURNITURE_ZONE ? "top" : at <= FURNITURE_ZONE ? "foot" : null;
    if (!edge) return null;
    const text = line.text.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
    return text ? `${edge}:${Math.round(at * 50)}:${text}` : null;
}

/**
 * **The furniture of a document** (#853 FR-1): the lines at the top or foot of its pages that come
 * back at the same height on at least three of the pages read. Fewer than three pages, and it has
 * none; a line in the middle of a page never is (FR-3). Each line is a segment of its baseline, so a
 * footer set in three cells is three keys.
 */
export function furnitureOf(pages: readonly { runs: readonly TextRun[]; bottom: number; height: number }[]): string[] {
    if (pages.length < FURNITURE_PAGES) return [];
    const seen = new Map<string, number>();
    for (const page of pages) {
        const keys = new Set(linesOf(page.runs).map((line) => furnitureKey(line, page.bottom, page.height)).filter((key): key is string => key !== null));
        for (const key of keys) seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    return [...seen].filter(([, pages]) => pages >= FURNITURE_PAGES).map(([key]) => key);
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
    /** Its footnote markers (#840): small runs raised off its baseline, attached to a word. */
    raised?: Set<TextRun>;
}

/** What a footnote is marked with: a number, a symbol, a lone letter (#840). */
const NOTE_MARK = /^(\d{1,3}|[*†‡§]|\p{L})$/u;

/**
 * A line's footnote markers (#840 FR-2): a run set at most three quarters the line's size, raised a
 * quarter of it off the baseline its largest letters sit on, written as a mark, and attached to the
 * word before it — no space typed between them.
 */
function raisedOf(line: Line): Set<TextRun> {
    const raised = new Set<TextRun>();
    const base = median(line.parts.filter((part) => part.size >= line.size * 0.95 && part.str.trim()).map((part) => part.y));
    for (const part of line.parts) {
        if (part.size > line.size * 0.75 || part.y - base < line.size * 0.25 || !NOTE_MARK.test(part.str.trim())) continue;
        const at = line.src.indexOf(part);
        if (at <= 0) continue;
        const before = line.text[at - 1];
        const from = line.src[at - 1];
        // Attached: the word right before it, or a space only the gap made — ours, or pdf.js's own
        // whitespace-only item for it — never one typed inside the text.
        if (/\s/.test(before) && from !== null && from.str.trim().length > 0) continue;
        raised.add(part);
    }
    return raised;
}

/** pdf.js's `styles` map, as far as a run's face goes. */
export type PdfStyles = Record<string, { fontFamily?: string } | undefined>;

/** The faces of a document's fonts, by pdf.js's name for each (#839): what its real name says. */
export type PdfFaces = Record<string, { bold?: boolean; italic?: boolean } | undefined>;

/** A pdf.js text item as a run: its place from `transform`, its size from the glyph scale. */
export function runOf(item: { str: string; transform: number[]; width: number; height?: number; fontName?: string }, styles?: PdfStyles, faces?: PdfFaces): TextRun {
    const [a, b, , d, e, f] = item.transform;
    const size = Math.abs(d) || Math.hypot(a, b) || item.height || 10;
    const run: TextRun = { str: item.str, x: e, y: f, size, width: item.width };
    if (item.fontName && styles) {
        run.font = item.fontName;
        if (styles[item.fontName]?.fontFamily === "monospace") run.mono = true;
        const face = faces?.[item.fontName];
        if (face?.bold) run.bold = true;
        if (face?.italic) run.italic = true;
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
    return out
        .map(tidy)
        .filter((line) => line.text.length > 0)
        .map((line) => ({ ...line, raised: raisedOf(line) }));
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
function spansOf(line: Line, kind: SpanKind, test: (run: TextRun) => boolean): InlineSpan[] {
    const spans: InlineSpan[] = [];
    let start = -1;
    let end = -1;
    for (let i = 0; i <= line.text.length; i++) {
        const char = line.text[i];
        const blank = char !== undefined && /\s/.test(char);
        const run = line.src[i];
        if (char !== undefined && (blank || (run && test(run)))) {
            if (!blank) {
                if (start < 0) start = i;
                end = i + 1;
            }
            continue;
        }
        if (start >= 0) spans.push({ kind, start, end });
        start = -1;
    }
    return spans;
}

/** A line's formats inside prose: inline code (#837), bold and italic (#839). */
function lineSpans(line: Line, options: ReflowOptions): InlineSpan[] {
    return [
        ...(options.typewritten ? [] : spansOf(line, "code", (run) => Boolean(run.mono))),
        ...spansOf(line, "strong", (run) => Boolean(run.bold) && !run.mono),
        ...spansOf(line, "em", (run) => Boolean(run.italic) && !run.mono),
        ...spansOf(line, "sup", (run) => line.raised?.has(run) ?? false),
    ];
}

/**
 * A run's face, read off its font's real name (#839): `Times-Bold`, `MinionPro-It`, `Arial,BoldItalic`,
 * and the faces LaTeX sets papers in — `NimbusRomNo9L-Medi` (its bold), `-ReguItal`, `CMBX10`, `CMTI10`.
 * Only the style part after the last `-` or `,` is read, so `Boldini-Regular` is neither; a subset's
 * `ABCDEF+` prefix is left out. A name with no style part says nothing, past Computer Modern's own.
 */
export function faceOf(name: string | undefined): { bold?: true; italic?: true } {
    if (!name) return {};
    const bare = name.replace(/^[A-Z]{6}\+/, "");
    const cut = Math.max(bare.lastIndexOf("-"), bare.lastIndexOf(","));
    if (cut < 0) {
        // Computer Modern names its face in its family: bold extended, text italic (never math italic).
        const cm = /^CM(BX|B|TI|BXTI|SL)\d/.exec(bare)?.[1];
        return cm ? { ...(cm.startsWith("B") ? { bold: true as const } : {}), ...(/TI|SL/.test(cm) ? { italic: true as const } : {}) } : {};
    }
    const style = bare.slice(cut + 1);
    return {
        ...(/bold|black|heavy|semibold|demi|^medi/i.test(style) ? { bold: true as const } : {}),
        ...(/ital|oblique/i.test(style) || style.endsWith("It") ? { italic: true as const } : {}),
    };
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
interface Draft extends Omit<PageBlock, "spans"> {
    spans: InlineSpan[];
    lines: Line[];
}

/** A line's formats, moved to where its text starts in the block. */
function spansAt(line: Line, kind: BlockKind, at: number, options: ReflowOptions): InlineSpan[] {
    if (kind === "heading" || kind === "listing" || options.plain) return [];
    return lineSpans(line, options).map((span) => ({ ...span, start: span.start + at, end: span.end + at }));
}

const letters = (text: string) => text.replace(/[^\p{L}\p{N}]/gu, "").length;

/**
 * A draft as the block it is: a listing's text is its lines; formats of one kind a space apart are
 * one. Bold or italic over the whole block is only the face it is set in (#839 FR-4): not marked.
 */
function finish(draft: Draft): PageBlock {
    const text = draft.kind === "listing" ? listingText(draft.lines) + draft.text : draft.text;
    const merged: InlineSpan[] = [];
    for (const span of [...draft.spans].sort((p, q) => (p.kind === q.kind ? p.start - q.start : p.kind < q.kind ? -1 : 1))) {
        const last = merged[merged.length - 1];
        if (last && last.kind === span.kind && text.slice(last.end, span.start).trim() === "") last.end = Math.max(last.end, span.end);
        else merged.push({ ...span });
    }
    const total = letters(text);
    const covered = (kind: SpanKind) => merged.filter((span) => span.kind === kind).reduce((sum, span) => sum + letters(text.slice(span.start, span.end)), 0);
    const whole = new Set((["strong", "em"] as const).filter((kind) => total > 0 && covered(kind) >= total));
    const spans = merged.filter((span) => !whole.has(span.kind as "strong" | "em")).sort((p, q) => p.start - q.start);
    const { lines: _lines, spans: _spans, ...block } = draft;
    return spans.length > 0 ? { ...block, text, spans } : { ...block, text };
}

/** What a line is, before the lines are made blocks: its kind, and what it starts. */
interface Role {
    kind: BlockKind;
    /** The line starts a block of its own, whatever today's rules say: an item (#838). */
    starts?: boolean;
    /** What the block it starts carries: an item's level, marker and order. */
    block?: Pick<PageBlock, "level" | "marker" | "ordered">;
}

interface RoleContext {
    body: number;
    leading: number;
    /** Where the column's lines start: the median of their left edges. */
    left: number;
    isHeading: (line: Line) => boolean;
    options: ReflowOptions;
    /** The footnote marks raised in the page's text (#840): a footnote is one of them. */
    marks: ReadonlySet<string>;
}

/** A footnote starts with its mark, raised or not, and its text (#840 FR-3). */
const FOOT_MARK = /^(\d{1,3}|[*†‡§])\s*(?=\S)/u;

/** The bullets that make a list on their own (#838 FR-3): nothing else is set like them. */
const SURE_BULLET = /^[•◦▪]\s+\S/u;
/** Dashes and stars: a list only two at a time, since a line may start with one. */
const DASH_BULLET = /^[–*-]\s+\S/u;
const NUMBER_MARK = /^(?:(\d{1,3})[.)]|\((\d{1,3})\))\s+\S/;
/** A letter is `a)` or `(a)`, never `a.`: `J. Smith` at a line's start is a name, not an item. */
const LETTER_MARK = /^(?:([a-z])\)|\(([a-z])\))\s+\S/;
const ROMAN_MARK = /^(?:([ivx]{1,5})[.)]|\(([ivx]{1,5})\))\s+\S/;

interface Mark {
    type: "sure" | "dash" | "number" | "letter" | "roman";
    /** Its place in its sequence: 1 for `1.`, `a)`, `(i)`; 0 for a bullet. */
    value: number;
    /** The marker and the space after it, in characters. */
    length: number;
}

function romanValue(text: string): number {
    const digits: Record<string, number> = { i: 1, v: 5, x: 10 };
    let total = 0;
    for (let i = 0; i < text.length; i++) {
        const value = digits[text[i]];
        total += value < (digits[text[i + 1]] ?? 0) ? -value : value;
    }
    return total;
}

/** The marker a line starts with, if it starts with one. A roman numeral is tried before a letter. */
function markOf(text: string): Mark | null {
    const length = (match: RegExpExecArray) => match[0].length - 1;
    let match = SURE_BULLET.exec(text);
    if (match) return { type: "sure", value: 0, length: length(match) };
    if ((match = DASH_BULLET.exec(text))) return { type: "dash", value: 0, length: length(match) };
    if ((match = NUMBER_MARK.exec(text))) return { type: "number", value: Number(match[1] ?? match[2]), length: length(match) };
    if ((match = ROMAN_MARK.exec(text))) return { type: "roman", value: romanValue(match[1] ?? match[2]), length: length(match) };
    if ((match = LETTER_MARK.exec(text))) return { type: "letter", value: (match[1] ?? match[2]).charCodeAt(0) - 96, length: length(match) };
    return null;
}

/**
 * What each line is (epic #836): a heading, a line of code, an item of a list or the part of one
 * that goes on below it — or prose, as today.
 *
 * **Only a clear list is a list** (#838 FR-3): a bullet that is nothing else (`•`, `◦`, `▪`) is an
 * item on its own; a dash, a star, a number or a letter only with a second one under it, at the same
 * place, the two in sequence — so `1. Introduction` alone stays what it was.
 */
function rolesOf(lines: readonly Line[], context: RoleContext): Role[] {
    const { body, leading, isHeading, options } = context;
    const roles: Role[] = lines.map((line) => ({ kind: isHeading(line) ? "heading" : !options.typewritten && !options.plain && isCodeLine(line) ? "listing" : "paragraph" }));
    if (options.plain) return roles;
    const prose = (i: number) => roles[i].kind === "paragraph";
    const marks = lines.map((line, i) => (prose(i) ? markOf(line.text) : null));
    const near = (a: number, b: number) => Math.abs(a - b) <= body * 0.5;
    // Whether a list can go on from the line above: no wide gap, no heading, no code.
    const goesOn = (i: number) => i > 0 && prose(i) && lines[i - 1].y - lines[i].y > 0 && lines[i - 1].y - lines[i].y <= leading * 1.45;

    // Which marked lines are items: a sure bullet always; any other only in a chain of two in sequence.
    const items = new Set<number>();
    const seen = new Set<number>();
    marks.forEach((mark, i) => {
        if (!mark || seen.has(i)) return;
        if (mark.type === "sure") {
            items.add(i);
            return;
        }
        const chain = [i];
        for (let j = i + 1; j < lines.length && goesOn(j); j++) {
            const next = marks[j];
            if (next && next.type === mark.type && near(lines[j].x, lines[i].x)) chain.push(j);
            else if (lines[j].x <= lines[i].x + body * 0.5) break;
        }
        chain.forEach((j) => seen.add(j));
        const values = chain.map((j) => marks[j]!.value);
        if (chain.length >= 2 && (mark.type === "dash" || values[1] === values[0] + 1)) chain.forEach((j) => items.add(j));
    });

    // Levels, by where each marker sits; a line under an item's words goes on with it (#838 FR-5, FR-6).
    let stack: number[] = [];
    let textX: number | null = null;
    lines.forEach((line, i) => {
        if (!goesOn(i)) {
            stack = [];
            textX = null;
        }
        if (items.has(i)) {
            const mark = marks[i]!;
            while (stack.length > 0 && line.x < stack[stack.length - 1] - body * 0.5) stack.pop();
            if (stack.length === 0 || line.x > stack[stack.length - 1] + body * 0.8) stack.push(line.x);
            else stack[stack.length - 1] = line.x;
            const ordered = mark.type === "number" || mark.type === "letter" || mark.type === "roman";
            roles[i] = { kind: "item", starts: true, block: { level: stack.length - 1, marker: mark.length, ordered } };
            textX = line.x + ((line.right - line.x) * mark.length) / Math.max(1, line.text.length);
            return;
        }
        if (textX !== null && prose(i) && near(line.x, textX)) {
            roles[i] = { kind: "item" };
            return;
        }
        stack = [];
        textX = null;
    });

    // A block quote (#840 FR-4): two lines or more at the body's size, all set in from both margins,
    // all starting at one place — so a first-line indent, or a centred block, is never one.
    const right = Math.max(...lines.map((line) => line.right));
    let quote: number[] = [];
    const flush = () => {
        if (quote.length >= 2) quote.forEach((j, k) => (roles[j] = k === 0 ? { kind: "quote", starts: true } : { kind: "quote" }));
        quote = [];
    };
    lines.forEach((line, i) => {
        const setIn = prose(i) && Math.abs(line.size - body) < body * 0.15 && line.x - context.left >= body * 2.5 && line.right <= right - body;
        if (setIn && quote.length > 0 && goesOn(i) && near(line.x, lines[quote[0]].x)) {
            quote.push(i);
            return;
        }
        flush();
        if (setIn) quote.push(i);
    });
    flush();

    // The foot of the column: every line after its last at the body's size. A footnote there starts
    // with a mark raised in the page's text; the small lines after it go on with it (#840 FR-3).
    let last = -1;
    lines.forEach((line, i) => {
        if (roles[i].kind !== "heading" && Math.abs(line.size - body) < body * 0.15) last = i;
    });
    let inNote = false;
    for (let i = last + 1; i < lines.length; i++) {
        if (!prose(i) || lines[i].size > body * 0.85) {
            inNote = false;
            continue;
        }
        const mark = FOOT_MARK.exec(lines[i].text);
        if (mark && context.marks.has(mark[1])) {
            roles[i] = { kind: "footnote", starts: true, block: { marker: mark[0].length } };
            inNote = true;
        } else if (inNote) roles[i] = { kind: "footnote" };
    }
    return roles;
}

/**
 * Lines into blocks, in reading order. **Today's paragraphs are decided first**, by the same rules as
 * always; a format may only cut one further (#836 FR-1). Where it cuts what today joined with a space,
 * the space stays — at the end of the block before — so the page's text is the same, and a highlight
 * made before the format still finds its words. A listing alone has its own whitespace (#837).
 */
function blocksOf(lines: readonly Line[], options: ReflowOptions = {}, marks: ReadonlySet<string> = new Set()): PageBlock[] {
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
    const roles = rolesOf(lines, { body, leading, left, isHeading, options, marks });

    const blocks: PageBlock[] = [];
    let current: Draft | null = null;
    let previous: Line | null = null;
    lines.forEach((line, i) => {
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
        const role = roles[i];
        const kind = role.kind;
        let breaks = !current || current.kind !== kind || Boolean(role.starts);
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
            // A line that goes on with the item above, cut from it today, is a part of that item (#838 FR-6).
            const part = !role.starts && current?.kind === kind && (kind === "item" || kind === "quote" || kind === "footnote") ? { ...(kind === "item" ? { level: current.level } : {}), cont: true } : {};
            current = { kind, text: kind === "listing" ? "" : line.text, spans: spansAt(line, kind, 0, options), lines: [line], ...role.block, ...part };
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
    });
    if (current) blocks.push(finish(current));
    // A page number, a lone running number: not text anyone reads — and never a line of code.
    return blocks.filter((block) => block.kind === "listing" || !/^\s*[-–]?\s*\d{1,4}\s*[-–]?\s*$/.test(block.text));
}

/** A page's runs as blocks — headings, paragraphs and the formats a page keeps — in reading order. */
export function reflowPage(runs: readonly TextRun[], options: ReflowOptions = {}): PageBlock[] {
    const furniture = options.furniture;
    // The page's furniture first, before the columns are read: a footer in cells is not a second column.
    const lines = furniture?.keys.size ? linesOf(runs).filter((line) => !furniture.keys.has(furnitureKey(line, furniture.bottom, furniture.height) ?? "")) : linesOf(runs);
    // The marks raised in the page's text: what makes a small line at the foot a footnote (#840).
    const marks = new Set(options.plain ? [] : lines.flatMap((line) => [...(line.raised ?? [])].map((run) => run.str.trim())));
    // Its islands of print (#854), read before the columns: a table is never taken for two of them.
    if (options.page && !options.plain) {
        const found = islandsOf(lines.map((line) => ({ ...line, cells: cellsOf(line) })), options.page);
        if (found.islands.length > 0 || found.rules.length > 0) return linkNotes(withIslands(lines, found.islands, found.rules, options.page, options, marks));
    }
    const split = columnSplit(lines);
    if (split === null) return linkNotes(blocksOf(lines, options, marks));
    // Full-width lines (a title across both columns) read first; then each column, top to bottom.
    const spanning = lines.filter((line) => line.x < split && line.right > split + (line.right - line.x) * 0.2);
    const rest = lines.filter((line) => !spanning.includes(line));
    return linkNotes([
        ...blocksOf(spanning, options, marks),
        ...blocksOf(rest.filter((line) => line.x < split), options, marks),
        ...blocksOf(rest.filter((line) => line.x >= split), options, marks),
    ]);
}

/** Where a line's cells start (#854): its first run, and each run more than an em past the one before. */
function cellsOf(line: Line): number[] {
    // pdf.js fills the space between two cells with a run of spaces: only the runs with words count.
    const inked = line.parts.filter((part) => part.str.trim().length > 0);
    const starts = [inked[0]?.x ?? line.x];
    for (let i = 1; i < inked.length; i++) {
        const before = inked[i - 1];
        if (inked[i].x - (before.x + before.width) > line.size) starts.push(inked[i].x);
    }
    return starts;
}

/** A part of the page that breaks its flow (#854): an island, or a separator, at its height. */
interface Break {
    top: number;
    left: number;
    right: number;
    block: PageBlock;
}

/**
 * A page with islands (#854): the lines outside them read as any page does — in columns, if it has
 * them once its tables are out — and each island and separator stands where it is, in reading order.
 * An island's text is its lines', so the page's text keeps every word (FR-4).
 */
function withIslands(lines: readonly Line[], islands: readonly Island[], rules: readonly number[], page: IslandPage, options: ReflowOptions, marks: ReadonlySet<string>): PageBlock[] {
    const inside = new Set(islands.flatMap((island) => island.lines));
    const rest = lines.filter((_, i) => !inside.has(i));
    const breaks: Break[] = [
        ...islands.map((island) => ({
            top: island.top,
            left: page.left + island.box.x * page.width,
            right: page.left + (island.box.x + island.box.w) * page.width,
            block: {
                kind: "island" as const,
                text: island.lines.map((i) => lines[i].text).join(" "),
                box: island.box,
                island: island.kind,
                aspect: (island.box.h * page.height) / Math.max(1e-6, island.box.w * page.width),
                points: island.box.w * page.width,
            },
        })),
        ...rules.map((y) => ({ top: y, left: page.left, right: page.left + page.width, block: { kind: "rule" as const, text: "" } })),
    ];
    const flow = (part: readonly Line[], marked: ReadonlySet<string>, at: readonly Break[]): PageBlock[] => {
        const out: PageBlock[] = [];
        let left = [...part];
        for (const brk of [...at].sort((a, b) => b.top - a.top)) {
            out.push(...blocksOf(left.filter((line) => line.y > brk.top), options, marked), brk.block);
            left = left.filter((line) => line.y <= brk.top);
        }
        return [...out, ...blocksOf(left, options, marked)];
    };
    const split = columnSplit(rest);
    if (split === null) return separated(flow(rest, marks, breaks));
    const spanning = rest.filter((line) => line.x < split && line.right > split + (line.right - line.x) * 0.2);
    const others = rest.filter((line) => !spanning.includes(line));
    const across = breaks.filter((brk) => brk.left < split && brk.right > split + (brk.right - brk.left) * 0.2);
    const side = (brk: Break) => ((brk.left + brk.right) / 2 < split ? "left" : "right");
    return separated([
        ...flow(spanning, marks, across),
        ...flow(others.filter((line) => line.x < split), marks, breaks.filter((brk) => !across.includes(brk) && side(brk) === "left")),
        ...flow(others.filter((line) => line.x >= split), marks, breaks.filter((brk) => !across.includes(brk) && side(brk) === "right")),
    ]);
}

/**
 * Separators only where they separate (#854 FR-5): never first or last, never two in a row, never
 * beside an island (its own frame) or a listing — the rules a manual boxes its code in are the box
 * the reading view already draws round it.
 */
function separated(blocks: PageBlock[]): PageBlock[] {
    const boxed = (block: PageBlock | undefined) => !block || block.kind === "rule" || block.kind === "island" || block.kind === "listing";
    return blocks.filter((block, i) => block.kind !== "rule" || (!boxed(blocks[i - 1]) && !boxed(blocks[i + 1]) && blocks[i - 1]?.kind !== "rule"));
}

/**
 * A marker to its footnote (#840 FR-7): when exactly one footnote on the page starts with its mark,
 * the marker opens it where it is read, as a book's does (#718). Two with the same mark, or none, and
 * it is only raised.
 */
function linkNotes(blocks: PageBlock[]): PageBlock[] {
    const notes = new Map<string, PageBlock[]>();
    for (const block of blocks) {
        if (block.kind !== "footnote" || block.cont) continue;
        const mark = block.text.slice(0, block.marker).trim();
        notes.set(mark, [...(notes.get(mark) ?? []), block]);
    }
    if (notes.size === 0) return blocks;
    let n = 0;
    const ids = new Map<string, string>();
    for (const [mark, found] of notes) {
        if (found.length !== 1) continue;
        const id = `zf-pdf-note-${++n}`;
        found[0].id = id;
        ids.set(mark, id);
    }
    for (const block of blocks) {
        const links = (block.spans ?? []).filter((span) => span.kind === "sup" && ids.has(block.text.slice(span.start, span.end).trim()));
        for (const span of links) block.spans!.push({ kind: "link", start: span.start, end: span.end, to: { note: ids.get(block.text.slice(span.start, span.end).trim())! } });
        if (links.length > 0) block.spans!.sort((p, q) => p.start - q.start);
    }
    return blocks;
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
