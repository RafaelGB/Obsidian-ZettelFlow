/**
 * **Islands of print** (#854, epic #850) — pure: the parts of a page the reading view shows **as
 * printed**, cropped from the page, because they are not running text: a table, a figure. No DOM, no
 * pdf.js. Reconstructing a table cell by cell is not something a reader can do reliably; showing it as
 * it was printed never misleads, and is what the state of the art does (epic #850).
 *
 * - **A table is found by its shape** (FR-1): three or more rows of three or more cells whose cells
 *   start at the same columns, within half an em; a wrapped cell's further lines go with their row. At
 *   least one column is short — an id, a type — and a wide row has four cells, so prose is never a table.
 * - **A figure is found by what is drawn** (FR-2): a picture of 8 % of the page or more, or a cluster
 *   of drawn shapes that large (a plot is vector paths). A logo is far smaller; a background behind the
 *   whole page is not a figure.
 * - **A rule** between two blocks of text is a separator (FR-5).
 * - **Only the clear case** (FR-7): anything else reads as text, as it did.
 *
 * Lines and islands meet in the runs' own space: PDF points from the page's bottom-left. A page turned
 * by its `/Rotate` has no islands (its print is read on the turned page).
 */

import type { CropBox } from "./pdfCrop";
import type { PagePrint } from "./pdfPrint";

/** What islands are read from: a line of text, as the reflow cut it (a segment of its baseline). */
export interface IslandLine {
    x: number;
    y: number;
    size: number;
    right: number;
    /**
     * Where its cells start: its runs that stand more than an em apart. A table's cells are often
     * closer than a gutter, so the line is one, yet its cells are there. Its start alone when absent.
     */
    cells?: number[];
}

/** Where the page sits in the runs' space, and what it prints besides its text. */
export interface IslandPage {
    left: number;
    bottom: number;
    width: number;
    height: number;
    print: PagePrint | null;
}

export interface Island {
    kind: "table" | "figure";
    /** Its box as shares of the page, from its top-left: the crop Page view would draw. */
    box: CropBox;
    /** The lines inside it, by index: their text is the island's, in reading order. */
    lines: number[];
    /** Its top and bottom in the runs' space. */
    top: number;
    bottom: number;
}

/** A figure is at least this share of the page. */
export const FIGURE_AREA = 0.08;
/** A cluster of drawn shapes is a figure when it holds at least this many (a plot's marks and lines). */
export const FIGURE_SHAPES = 12;
/** A rule is a separator when it runs at least this share of the page across. */
export const SEPARATOR_WIDTH = 0.4;
/** A table has at least this many rows of at least this many cells. */
const TABLE_ROWS = 3;
const TABLE_CELLS = 3;
const WIDE_ROW_CELLS = 4;
/** Lines on one baseline this many ems apart are one row; further, they are side by side. */
const ROW_GAP = 12;
/** One of a table's columns is short: its cells at most this share of the page wide, typically. */
const SHORT_CELL = 0.15;
/** Shapes this close (a share of the page, about 15 pt) are one cluster: a bar chart's groups are one plot. */
const NEAR = 0.02;
/** A figure's label stands this many ems off what it draws: a y-axis's numbers, an x-axis's names. */
const LABEL_REACH = 4;
/** Two tables this close, one under the other (a share of the page, about two lines), are one. */
const JOIN = 0.03;
/** The crop's border around what it holds, as a share of the page. */
const PAD = 0.008;

/** What the islands of a page are, and where its separators are (their height, in the runs' space). */
export function islandsOf(lines: readonly IslandLine[], page: IslandPage): { islands: Island[]; rules: number[] } {
    const tables = tablesOf(lines, page);
    const figures = figuresOf(lines, page, tables);
    const islands = [...tables, ...figures].map((island) => clear(island, lines, page)).sort((a, b) => b.top - a.top);
    return { islands, rules: separatorsOf(lines, page, islands) };
}

// ── tables ───────────────────────────────────────────────────────────────────

interface Row {
    y: number;
    size: number;
    left: number;
    right: number;
    lines: number[];
    starts: number[];
    /** A column of prose: nothing joins it. */
    prose?: boolean;
}

/**
 * A page's rows: the lines that sit together on one baseline — not the whole baseline, which in two
 * columns holds a table's row and a line of prose beside it (walked on *A Survey of LLMs*, p. 14).
 */
function rowsOf(lines: readonly (IslandLine | null)[]): Row[] {
    const rows: Row[] = [];
    const order = lines.map((_, i) => i).filter((i) => lines[i] !== null).sort((a, b) => lines[b]!.y - lines[a]!.y || lines[a]!.x - lines[b]!.x);
    for (const index of order) {
        const line = lines[index]!;
        // A column of prose (one cell, a third of the page wide) is a row of its own, never a cell beside one.
        const column = (l: IslandLine) => (l.cells?.length ?? 1) === 1 && l.right - l.x > l.size * 25;
        const row = column(line)
            ? undefined
            : rows.find((r) => !r.prose && Math.abs(r.y - line.y) <= Math.max(r.size, line.size) * 0.3 && line.x - r.right <= Math.max(r.size, line.size) * ROW_GAP);
        if (row) {
            row.lines.push(index);
            row.size = Math.max(row.size, line.size);
            row.right = Math.max(row.right, line.right);
        } else rows.push({ y: line.y, size: line.size, left: line.x, right: line.right, lines: [index], starts: [], prose: column(line) });
    }
    for (const row of rows) row.starts = row.lines.flatMap((i) => lines[i]!.cells ?? [lines[i]!.x]);
    return rows.sort((a, b) => b.y - a.y || a.left - b.left);
}

function tablesOf(lines: readonly IslandLine[], page: IslandPage): Island[] {
    // A wide line of few cells is prose — two columns read as one line, beside a table — never one of its
    // rows: a table that wide has four cells at least (a header set as one run is found by its rule).
    const prose = (line: IslandLine) => (line.cells?.length ?? 1) < WIDE_ROW_CELLS && line.right - line.x > page.width * 0.45;
    const rows = rowsOf(lines.map((line) => (prose(line) ? null : line)));
    const used = new Set<Row>();
    const out: Island[] = [];
    for (const head of rows) {
        if (used.has(head) || head.starts.length < TABLE_CELLS) continue;
        const columns = head.starts;
        const tol = head.size * 0.5;
        const column = (x: number) => columns.findIndex((c) => Math.abs(c - x) <= tol);
        // A wrapped cell's further line starts inside its column (after its bullet, say): the column it falls in.
        const within = (x: number) => columns.reduce((found, c, k) => (c - tol <= x ? k : found), -1);
        const span = { left: head.left - head.size, right: head.right + head.size * 4 };
        const taken: Row[] = [head];
        let full = 1;
        for (const row of rows.slice(rows.indexOf(head) + 1)) {
            // Beside the table, in the other column: neither its row nor its end.
            if (used.has(row) || row.right < span.left || row.left > span.right) continue;
            if (taken[taken.length - 1].y - row.y > row.size * 4) break;
            if (row.starts.length >= TABLE_CELLS) {
                // A row: its cells start on the columns — all but one, at least two (a centred column drifts).
                const on = row.starts.filter((x) => column(x) >= 0).length;
                if (on < 2 || on < row.starts.length - 1) break;
                full++;
            } else {
                // A wrapped cell's further line: in a column, and not the first — or the table is over.
                if (row.starts.map(within).some((c) => c <= 0)) break;
            }
            taken.push(row);
        }
        if (full >= TABLE_ROWS && hasShortColumn(lines, taken, column, page.width)) {
            for (const row of taken) used.add(row);
            out.push(tableIsland(lines, taken, page));
        }
    }
    return joinTables(out, lines);
}

/** A table cut in pieces — by a row of its own categories, a wider gap — is one table (walked on *Attention*, p. 9). */
function joinTables(tables: Island[], lines: readonly IslandLine[]): Island[] {
    const out: Island[] = [];
    for (const table of [...tables].sort((a, b) => b.top - a.top)) {
        const last = out[out.length - 1];
        const overlaps = last && table.box.x < last.box.x + last.box.w && last.box.x < table.box.x + table.box.w;
        if (last && overlaps && table.box.y <= last.box.y + last.box.h + JOIN) {
            out[out.length - 1] = { ...last, box: union(last.box, table.box), bottom: Math.min(last.bottom, table.bottom), lines: ordered(lines, [...last.lines, ...table.lines]) };
        } else out.push(table);
    }
    return out;
}

function hasShortColumn(lines: readonly IslandLine[], rows: readonly Row[], column: (x: number) => number, width: number): boolean {
    const widths = new Map<number, number[]>();
    // A cell's width, roughly: from its start to the next cell's, or to its line's end.
    for (const row of rows) {
        if (row.starts.length < TABLE_CELLS) continue;
        const end = Math.max(...row.lines.map((i) => lines[i].right));
        row.starts.forEach((start, k) => {
            const c = column(start);
            widths.set(c, [...(widths.get(c) ?? []), (row.starts[k + 1] ?? end) - start]);
        });
    }
    return [...widths.values()].some((list) => median(list) <= width * SHORT_CELL);
}

function tableIsland(lines: readonly IslandLine[], rows: readonly Row[], page: IslandPage): Island {
    const members = rows.flatMap((row) => row.lines);
    let top = Math.max(...members.map((i) => lines[i].y + lines[i].size));
    let bottom = Math.min(...members.map((i) => lines[i].y - lines[i].size * 0.4));
    const left = Math.min(...members.map((i) => lines[i].x));
    const right = Math.max(...members.map((i) => lines[i].right));
    // Its rules, when it is ruled: the line just above its first row and just below its last. A header
    // set as one run (its cells cannot be told apart) sits between the top rule and the first row.
    for (const rule of userRules(page)) {
        if (rule.x2 < left || rule.x1 > right) continue;
        if (rule.y > top && rule.y - top <= Math.max(...rows.map((row) => row.size)) * 4) top = rule.y;
        if (rule.y < bottom && bottom - rule.y <= rows[rows.length - 1].size * 1.6) bottom = rule.y;
    }
    // Every line inside the box is the table's: a header set in another size, a cell's stray line.
    const inside = lines.map((_, i) => i).filter((i) => lines[i].y <= top && lines[i].y >= bottom && lines[i].x >= left - lines[i].size && lines[i].right <= right + lines[i].size);
    return { kind: "table", box: boxOf(page, left, right, top, bottom), lines: ordered(lines, inside), top, bottom };
}

// ── figures ──────────────────────────────────────────────────────────────────

function figuresOf(lines: readonly IslandLine[], page: IslandPage, tables: readonly Island[]): Island[] {
    const print = page.print;
    if (!print) return [];
    const pictures = print.pictures.filter((box) => box.w * box.h >= FIGURE_AREA && box.w * box.h < 0.95);
    // A plot's gridlines are its own: the rules are drawn shapes too (a lone rule is never a dozen).
    const drawn = [...(print.shapes ?? []), ...print.rules].filter((box) => box.w * box.h < 0.95);
    const clusters = clustersOf(drawn).filter((c) => c.count >= FIGURE_SHAPES && c.box.w * c.box.h >= FIGURE_AREA);
    const boxes = [...pictures, ...clusters.map((c) => c.box)];
    const out: Island[] = [];
    for (const share of joinBoxes(boxes)) {
        const top = page.bottom + (1 - share.y) * page.height;
        const bottom = page.bottom + (1 - share.y - share.h) * page.height;
        // A figure inside a table, or a table's shading, is the table's.
        if (tables.some((t) => t.top >= bottom && t.bottom <= top)) continue;
        const left = page.left + share.x * page.width;
        const right = left + share.w * page.width;
        // Its own words: what is inside it, and its labels — a short line a few ems off its axes.
        const label = (line: IslandLine) => line.right - line.x <= page.width * SHORT_CELL;
        const reach = (line: IslandLine) => (label(line) ? line.size * LABEL_REACH : line.size);
        const inside = lines.map((_, i) => i).filter((i) => {
            const line = lines[i];
            return line.y <= top + (label(line) ? reach(line) : 0) && line.y >= bottom - reach(line) && line.x >= left - reach(line) && line.right <= right + reach(line);
        });
        // The crop holds its labels too.
        let lo = bottom;
        let hi = top;
        let x1 = left;
        let x2 = right;
        for (const i of inside) {
            lo = Math.min(lo, lines[i].y - lines[i].size * 0.4);
            hi = Math.max(hi, lines[i].y + lines[i].size);
            x1 = Math.min(x1, lines[i].x);
            x2 = Math.max(x2, lines[i].right);
        }
        out.push({ kind: "figure", box: boxOf(page, x1, x2, hi, lo), lines: ordered(lines, inside), top: hi, bottom: lo });
    }
    return out;
}

function clustersOf(boxes: readonly CropBox[]): { box: CropBox; count: number }[] {
    const clusters: { box: CropBox; count: number }[] = [];
    for (const box of [...boxes].sort((a, b) => a.y - b.y)) {
        const near = clusters.filter((c) => touches(c.box, box, NEAR));
        if (near.length === 0) {
            clusters.push({ box: { ...box }, count: 1 });
            continue;
        }
        const [first, ...rest] = near;
        first.box = union(first.box, box);
        first.count++;
        for (const other of rest) {
            first.box = union(first.box, other.box);
            first.count += other.count;
            clusters.splice(clusters.indexOf(other), 1);
        }
    }
    return clusters;
}

/** Boxes that overlap are one figure (a photograph and the plot drawn over it). */
function joinBoxes(boxes: readonly CropBox[]): CropBox[] {
    const out: CropBox[] = [];
    for (const box of boxes) {
        const hit = out.findIndex((o) => touches(o, box, 0));
        if (hit >= 0) out[hit] = union(out[hit], box);
        else out.push({ ...box });
    }
    return out;
}

// ── separators ───────────────────────────────────────────────────────────────

function separatorsOf(lines: readonly IslandLine[], page: IslandPage, islands: readonly Island[]): number[] {
    const out: number[] = [];
    for (const rule of userRules(page)) {
        if (rule.x2 - rule.x1 < page.width * SEPARATOR_WIDTH) continue;
        // Not at the page's edges (a footer's line), and not a table's or a figure's own.
        const at = (rule.y - page.bottom) / page.height;
        if (at < 0.12 || at > 0.88) continue;
        if (islands.some((island) => rule.y <= island.top + 2 && rule.y >= island.bottom - 2)) continue;
        // Not an underline: no line of text sits on it.
        if (lines.some((line) => line.right > rule.x1 && line.x < rule.x2 && rule.y > line.y - line.size * 0.5 && rule.y < line.y + line.size)) continue;
        const above = lines.some((line) => line.y > rule.y);
        const below = lines.some((line) => line.y < rule.y);
        if (above && below && !out.some((y) => Math.abs(y - rule.y) < 2)) out.push(rule.y);
    }
    return out.sort((a, b) => b - a);
}

/**
 * An island's crop and the lines its border reaches (walked on GPT-4, p. 3, and *Attention*, p. 8): a
 * line inside its width is its own — a plot's title, a table's upper header — and the crop takes it
 * whole; a line that runs past its sides is the page's text, left whole out of the picture.
 */
function clear(island: Island, lines: readonly IslandLine[], page: IslandPage): Island {
    const own = new Set(island.lines);
    let { y, h } = island.box;
    const { x, w } = island.box;
    let top = island.top;
    let bottom = island.bottom;
    for (let i = 0; i < lines.length; i++) {
        if (own.has(i)) continue;
        const line = lines[i];
        const left = (line.x - page.left) / page.width;
        const right = (line.right - page.left) / page.width;
        if (right < x || left > x + w) continue;
        // The line's top and bottom, as shares of the page from its top.
        const above = 1 - (line.y + line.size - page.bottom) / page.height;
        const below = 1 - (line.y - line.size * 0.3 - page.bottom) / page.height;
        if (below <= y || above >= y + h) continue;
        if (left >= x - PAD && right <= x + w + PAD) {
            // Inside its width: its own. The crop grows to hold it all.
            own.add(i);
            const end = Math.max(y + h, below + PAD);
            y = Math.min(y, above - PAD);
            h = end - y;
            top = Math.max(top, line.y + line.size);
            bottom = Math.min(bottom, line.y - line.size * 0.3);
            continue;
        }
        const middle = y + h / 2;
        if (below <= middle) {
            h -= below - y;
            y = below;
        } else if (above >= middle) h = above - y;
    }
    const box = clamp({ x, y, w, h: Math.max(0, h) });
    return { ...island, box, top, bottom, lines: ordered(lines, [...own]) };
}

// ── geometry ─────────────────────────────────────────────────────────────────

function userRules(page: IslandPage): { x1: number; x2: number; y: number }[] {
    return (page.print?.rules ?? [])
        .filter((rule) => rule.w >= rule.h)
        .map((rule) => ({ x1: page.left + rule.x * page.width, x2: page.left + (rule.x + rule.w) * page.width, y: page.bottom + (1 - rule.y - rule.h / 2) * page.height }));
}

function boxOf(page: IslandPage, left: number, right: number, top: number, bottom: number): CropBox {
    const x = (left - page.left) / page.width;
    const y = 1 - (top - page.bottom) / page.height;
    return clamp({ x: x - PAD, y: y - PAD, w: (right - left) / page.width + 2 * PAD, h: (top - bottom) / page.height + 2 * PAD });
}

function clamp(box: CropBox): CropBox {
    const x = Math.max(0, box.x);
    const y = Math.max(0, box.y);
    return { x, y, w: Math.min(1, box.x + box.w) - x, h: Math.min(1, box.y + box.h) - y };
}

function touches(a: CropBox, b: CropBox, gap: number): boolean {
    return a.x - gap <= b.x + b.w && b.x - gap <= a.x + a.w && a.y - gap <= b.y + b.h && b.y - gap <= a.y + a.h;
}

function union(a: CropBox, b: CropBox): CropBox {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/** Lines in reading order: top to bottom, left to right on a baseline. */
function ordered(lines: readonly IslandLine[], indices: number[]): number[] {
    return [...indices].sort((a, b) => lines[b].y - lines[a].y || lines[a].x - lines[b].x);
}

function median(values: number[]): number {
    const sorted = [...values].sort((p, q) => p - q);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
}
