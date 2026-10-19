/**
 * **The formats paper** (epic #836): one page set with the common formats a PDF loses in the
 * reading view — a heading, bold, italic, a footnote marker, inline code, two lists, a listing, a
 * block quote, a link and a footnote. Its layout is `test/fixtures/pdf/formats.json`, the same file
 * `scripts/pdf-formats-sample.mjs` writes a real PDF from, so the page the tests read is the page a
 * person walks in Obsidian.
 *
 * Here it is read back the way pdf.js 5.3 hands it over: text items with a `transform`, a `width`
 * and a `fontName`, and the `styles` map whose `fontFamily` says `monospace` for Courier.
 */
import { readFileSync } from "fs";
import { join } from "path";

interface Op {
    font: string;
    size: number;
    x: number;
    y: number;
    str: string;
}

interface Layout {
    width: number;
    height: number;
    fonts: Record<string, string>;
    pages: { ops: Op[]; links?: { rect: number[]; url?: string; dest?: number }[] }[];
}

export const FORMATS: Layout = JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "pdf", "formats.json"), "utf8"));

export interface FormatsItem {
    str: string;
    transform: number[];
    width: number;
    height: number;
    fontName: string;
}

/** The width the sample's writer gives a string: Times at ~0.47 em, Courier at 0.6 em. */
export function opWidth(op: Pick<Op, "font" | "str" | "size">): number {
    return op.str.length * op.size * (FORMATS.fonts[op.font] === "Courier" ? 0.6 : 0.47);
}

/** A page of the formats paper as pdf.js items, with its `styles` and its fonts' real names. */
export function formatsPage(index = 0): { items: FormatsItem[]; styles: Record<string, { fontFamily: string }>; names: Record<string, string> } {
    const items = FORMATS.pages[index].ops.map((op) => ({
        str: op.str,
        transform: [op.size, 0, 0, op.size, op.x, op.y],
        width: opWidth(op),
        height: op.size,
        fontName: op.font,
    }));
    const styles: Record<string, { fontFamily: string }> = {};
    for (const [key, name] of Object.entries(FORMATS.fonts)) styles[key] = { fontFamily: name === "Courier" ? "monospace" : "serif" };
    return { items, styles, names: { ...FORMATS.fonts } };
}

/** Text with every run of whitespace folded to one space, as the highlighter compares it. */
export function folded(text: string): string {
    return text.replace(/\s+/g, " ");
}

/** Text with no whitespace at all: the characters a format may never move. */
export function nonSpace(text: string): string {
    return text.replace(/\s+/g, "");
}
