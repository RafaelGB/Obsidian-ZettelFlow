/**
 * **What a page prints besides its text** (#852, epic #850) — pure: its pictures, its rules, and how
 * many shapes it draws, read from its operator list by the interpreter Crop margins uses (#769). No
 * DOM, no pdf.js: the list comes in as plain arrays, the boxes go out as shares of the page.
 *
 * Two things are read off it:
 *
 * - **Whether a PDF is designed** (FR-1): a document made to be seen as printed — a letterhead or a
 *   logo in the same place on page after page, or a page that is mostly one picture. Such a document
 *   opens in Page view. Each rule is the clear case only (epic FR-2): a paper with a figure on page 2
 *   is not designed, and neither is one with a ruled table — read on arXiv, papers have them too.
 * - **What the reading view leaves out of a page** (FR-2): its pictures and its ruled tables, said
 *   in one quiet line under the page, with the way to Page view.
 */

import { paintedOf, shareBox, type CropBox, type CropOps, type PdfRect } from "./pdfCrop";

export interface PagePrint {
    /** The pictures painted on the page, past the size of an icon, as shares of it. */
    pictures: CropBox[];
    /** The thin straight lines drawn across it: rules, and the lines of a ruled table. */
    rules: CropBox[];
    /** How many shapes it paints, rules included. */
    paths: number;
}

/** A picture smaller than this share of the page is an icon or a bullet, not something left out. */
export const PICTURE_MIN_AREA = 0.0025;
/** A picture this much of the page is the page (a cover, a plate, a photograph) — a paper's figure is less. */
export const PICTURE_PAGE = 0.6;
/** A line is thin when it is at most this share of the page's height thick (about 3 pt on Letter)… */
const RULE_THICK = 0.004;
/** …and a rule when it runs at least this share of the page across… */
const RULE_LONG = 0.15;
/** …or down: a table's column lines are only as tall as the table (three rows of 10 pt type). */
const RULE_DOWN = 0.04;
/** Places are compared to this share of the page: a logo moved by a hair is the same logo. */
const PLACE = 0.02;
/** Segments of one line sit within this share of the page of each other (half a point on Letter). */
const LEVEL = 0.002;
/** Pieces of a line this close (about 3 pt on Letter) meet: a cell's border, then the next one's. */
const MEET = 0.005;

/** The page's print, from its operator list: `null` when the list holds something not understood. */
export function printOf(
    opList: { fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> } | null,
    ops: CropOps | null,
    toView: (rect: PdfRect) => ArrayLike<number>,
    width: number,
    height: number
): PagePrint | null {
    if (!opList || !ops) return null;
    const pictures: CropBox[] = [];
    const rules: CropBox[] = [];
    const flat: CropBox[] = [];
    const tall: CropBox[] = [];
    let paths = 0;
    const aspect = height / Math.max(1e-6, width);
    const known = paintedOf(opList.fnArray, opList.argsArray, ops, (rect, picture) => {
        const box = shareBox(toView(rect), width, height);
        if (picture) {
            if (box.w * box.h >= PICTURE_MIN_AREA) pictures.push(box);
            return;
        }
        paths++;
        // Thin, in one unit for both directions (a share of the page's height): a piece of a line.
        if (box.h <= RULE_THICK && box.w > box.h) flat.push(box);
        else if (box.w / aspect <= RULE_THICK && box.h > box.w) tall.push(box);
    });
    if (!known) return null;
    // A table's lines are often drawn a cell at a time: the pieces that meet are one line first.
    for (const line of joined(flat, true)) if (line.w >= RULE_LONG) rules.push(line);
    for (const line of joined(tall, false)) if (line.h >= RULE_DOWN) rules.push(line);
    // A line along a picture's edge is the picture's frame (a screenshot's border), not a rule.
    const framing = (rule: CropBox) => pictures.some((pic) => onEdge(rule, pic));
    return { pictures, rules: rules.filter((rule) => !framing(rule)), paths };
}

/** Thin pieces on one level that meet (or nearly), joined into the lines they draw. */
function joined(pieces: CropBox[], acrossPage: boolean): CropBox[] {
    const at = (box: CropBox) => (acrossPage ? box.y : box.x);
    const from = (box: CropBox) => (acrossPage ? box.x : box.y);
    const size = (box: CropBox) => (acrossPage ? box.w : box.h);
    const sorted = [...pieces].sort((a, b) => Math.round(at(a) / LEVEL) - Math.round(at(b) / LEVEL) || from(a) - from(b));
    const out: CropBox[] = [];
    for (const piece of sorted) {
        const last = out[out.length - 1];
        if (last && Math.round(at(last) / LEVEL) === Math.round(at(piece) / LEVEL) && from(piece) <= from(last) + size(last) + MEET) {
            const end = Math.max(from(last) + size(last), from(piece) + size(piece));
            if (acrossPage) last.w = end - last.x;
            else last.h = end - last.y;
            continue;
        }
        out.push({ ...piece });
    }
    return out;
}

/** Whether a thin line lies along an edge of `box`, within the place tolerance, and no longer than it. */
function onEdge(rule: CropBox, box: CropBox): boolean {
    const near = (a: number, b: number) => Math.abs(a - b) <= PLACE / 2;
    const inside = (from: number, length: number, start: number, size: number) => from >= start - PLACE && from + length <= start + size + PLACE;
    if (rule.w >= rule.h) return (near(rule.y, box.y) || near(rule.y, box.y + box.h)) && inside(rule.x, rule.w, box.x, box.w);
    return (near(rule.x, box.x) || near(rule.x, box.x + box.w)) && inside(rule.y, rule.h, box.y, box.h);
}

const isAcross = (rule: CropBox) => rule.w >= rule.h;

/**
 * A page with a ruled table on it: a grid (four lines across and two down), or six lines across — a
 * table ruled only between its rows. A plot's two axes are not one; its ticks are too short to count.
 */
export function hasRuledTable(print: PagePrint): boolean {
    // Lines, not segments: a footer ruled as a box of three cells is two lines across, cut in three.
    const levels = (rules: CropBox[], at: (rule: CropBox) => number) => new Set(rules.map((rule) => Math.round(at(rule) / LEVEL))).size;
    const across = levels(print.rules.filter(isAcross), (rule) => rule.y);
    const down = levels(print.rules.filter((rule) => !isAcross(rule)), (rule) => rule.x);
    return (across >= 4 && down >= 2) || across >= 6;
}

const placeKey = (box: CropBox) => [box.x, box.y, box.w, box.h].map((n) => Math.round(n / PLACE)).join(",");

/**
 * Whether a PDF is designed (#852 FR-1), from its sampled pages' print: the same picture in the same
 * place on most of them (a letterhead, a logo), or a page that is mostly a picture. Pages that could
 * not be read say nothing; with none read, it is not designed.
 */
export function isDesigned(prints: readonly (PagePrint | null)[]): boolean {
    const read = prints.filter((print): print is PagePrint => print !== null);
    if (read.length === 0) return false;
    if (read.some((print) => print.pictures.some((box) => box.w * box.h >= PICTURE_PAGE))) return true;
    if (read.length < 2) return false;
    const seen = new Map<string, number>();
    for (const print of read) for (const key of new Set(print.pictures.map(placeKey))) seen.set(key, (seen.get(key) ?? 0) + 1);
    const most = Math.ceil((read.length * 2) / 3);
    return [...seen.values()].some((pages) => pages >= Math.max(2, most));
}

/** What the reading view leaves out of a page (#852 FR-2): its pictures, and whether it has a ruled table. */
export interface LeftOut {
    pictures: number;
    tables: boolean;
}

/** `null` when the page leaves nothing out that is worth saying. */
export function leftOutOf(print: PagePrint | null): LeftOut | null {
    if (!print) return null;
    const tables = hasRuledTable(print);
    return print.pictures.length > 0 || tables ? { pictures: print.pictures.length, tables } : null;
}
