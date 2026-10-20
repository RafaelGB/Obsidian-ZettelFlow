/**
 * **The shape of a book's contents** (#861): what the Contents panel draws, read off the source's own
 * contents — its parts as bands, its chapters as rows, a chapter's sub-entries as its sections, and
 * what lies before the first part and after the last as front and back matter. Pure: the panel
 * draws it, and Find filters it.
 */

/** One entry of a source's contents, as the Reader holds it. */
export interface ContentsEntry {
    title: string;
    chapter: number;
    depth: number;
    fragment?: string;
}

/** Where a title matches what was typed in *Find*: from, to, in the title as shown. */
export type Span = readonly [number, number];

export interface ContentsSection {
    num: string;
    title: string;
    chapter: number;
    fragment?: string;
    /** The page it starts on, in a source that has pages. */
    locator?: string;
    hit?: Span;
}

export interface ContentsRow {
    num: string;
    title: string;
    chapter: number;
    fragment?: string;
    locator?: string;
    sections: ContentsSection[];
    hit?: Span;
}

export type ContentsGroupKind = "part" | "front" | "back" | "loose";

export interface ContentsGroup {
    kind: ContentsGroupKind;
    /** A part's own title; front, back and loose groups are named by the panel, or not at all. */
    title: string;
    /** What its folding is remembered by while the source stays open. */
    key: string;
    rows: ContentsRow[];
}

export interface ShapeInput {
    /** A reflowed book (an EPUB's spine items): its parts are read from where their chapters lie. */
    reflowed: boolean;
    toc: readonly ContentsEntry[];
    /** The page a chapter starts on, in a source that has pages. */
    locator?: (chapter: number) => string | undefined;
}

/** From this many entries on, Contents offers *Find in contents* (FR-16). */
export const FIND_AT = 24;

/**
 * A title's own number, set apart (FR-9): `3.2`, `7.`, `1 ·`, `A.1`, `IV.` — never a year (`1984`,
 * `2001:`), never a word (`A map`, `I think`), never a title that is only a number.
 */
const NUMBERED = /^(\d{1,3}(?:\.\d{1,3})*|[A-Z](?:\.\d{1,3})+)(?!\.?\d)(?:\s*[.:)·–—]\s*|\s+)(?=\S)/;
const ROMAN = /^([IVXLC]+)\.\s+(?=\S)/;

export function splitNumber(raw: string): { num: string; title: string } {
    const match = NUMBERED.exec(raw) ?? ROMAN.exec(raw);
    if (!match) return { num: "", title: raw };
    return { num: match[1], title: raw.slice(match[0].length) };
}

interface Node {
    entry: ContentsEntry;
    children: Node[];
}

function treeOf(toc: readonly ContentsEntry[]): Node[] {
    const roots: Node[] = [];
    const stack: Node[] = [];
    for (const entry of toc) {
        const node: Node = { entry, children: [] };
        while (stack.length > 0 && stack[stack.length - 1].entry.depth >= entry.depth) stack.pop();
        if (stack.length > 0) stack[stack.length - 1].children.push(node);
        else roots.push(node);
        stack.push(node);
    }
    return roots;
}

const height = (node: Node): number => 1 + Math.max(0, ...node.children.map(height));

function descendants(node: Node): Node[] {
    return node.children.flatMap((child) => [child, ...descendants(child)]);
}

function rowOf(node: Node, locator: ShapeInput["locator"]): ContentsRow {
    const { num, title } = splitNumber(node.entry.title.trim());
    return {
        num,
        title,
        chapter: node.entry.chapter,
        ...(node.entry.fragment ? { fragment: node.entry.fragment } : {}),
        ...located(locator, node.entry.chapter),
        sections: descendants(node).map((child) => {
            const split = splitNumber(child.entry.title.trim());
            return {
                num: split.num,
                title: split.title,
                chapter: child.entry.chapter,
                ...(child.entry.fragment ? { fragment: child.entry.fragment } : {}),
                ...located(locator, child.entry.chapter),
            };
        }),
    };
}

function located(locator: ShapeInput["locator"], chapter: number): { locator?: string } {
    const at = locator?.(chapter);
    return at ? { locator: at } : {};
}

/**
 * The bands, rows and sections of a source's contents (FR-5, FR-8, FR-11). A part is, in a reflowed
 * book, a top entry whose sub-entries lie in other spine items; in a paged one, a top entry with
 * sub-entries when the outline runs three levels deep. With no part there is one loose list.
 */
export function contentsShape(input: ShapeInput): ContentsGroup[] {
    const roots = treeOf(input.toc);
    const deep = !input.reflowed && Math.max(0, ...roots.map(height)) >= 3;
    const isPart = (node: Node) => node.children.length > 0 && (input.reflowed ? descendants(node).some((d) => d.entry.chapter !== node.entry.chapter) : deep);
    const parts = roots.map(isPart);
    const first = parts.indexOf(true);
    if (first < 0) return roots.length === 0 ? [] : [{ kind: "loose", title: "", key: "loose", rows: roots.map((node) => rowOf(node, input.locator)) }];
    const last = parts.lastIndexOf(true);
    const groups: ContentsGroup[] = [];
    roots.forEach((node, i) => {
        if (parts[i]) {
            groups.push({ kind: "part", title: node.entry.title.trim(), key: `part:${i}`, rows: node.children.map((child) => rowOf(child, input.locator)) });
            return;
        }
        const kind: ContentsGroupKind = i < first ? "front" : i > last ? "back" : "loose";
        const previous = groups[groups.length - 1];
        // Loose entries next to each other share one group; between two parts they sit without a band.
        if (previous && previous.kind === kind && kind !== "part") previous.rows.push(rowOf(node, input.locator));
        else groups.push({ kind, title: "", key: kind === "loose" ? `loose:${i}` : kind, rows: [rowOf(node, input.locator)] });
    });
    return groups;
}

/** Every entry the shape holds: its parts, its rows and their sections (what *Find* is offered by). */
export function entryCount(groups: readonly ContentsGroup[]): number {
    return groups.reduce((n, group) => n + (group.kind === "part" ? 1 : 0) + group.rows.reduce((m, row) => m + 1 + row.sections.length, 0), 0);
}

/**
 * The row you are in (FR-12): the chapter on screen's own row, else the last row before it — as a
 * part's title page sits before its first chapter. `null` before the first entry.
 */
export function currentRow(groups: readonly ContentsGroup[], chapter: number): { group: number; row: number } | null {
    let before: { group: number; row: number } | null = null;
    for (let g = 0; g < groups.length; g++) {
        for (let r = 0; r < groups[g].rows.length; r++) {
            const at = groups[g].rows[r].chapter;
            if (at === chapter) return { group: g, row: r };
            if (at < chapter) before = { group: g, row: r };
        }
    }
    return before;
}

/** Where the line at the top of the screen is, and where each of the chapter's headings is. */
export interface ReadingPosition {
    top: number;
    offsetOf(fragment: string): number | null;
}

/**
 * The section you are in, under the row you are in (FR-12), or `-1`: the last one starting on or
 * before the page — or, inside a reflowed chapter, the last heading above the top of the screen.
 * A heading inside the chapter is never guessed without the page's layout.
 */
export function currentSection(row: ContentsRow, chapter: number, position?: ReadingPosition): number {
    let found = -1;
    row.sections.forEach((section, i) => {
        if (section.chapter < chapter) found = i;
        else if (section.chapter === chapter) {
            if (!section.fragment) found = i;
            else if (position) {
                const at = position.offsetOf(section.fragment);
                if (at !== null && at <= position.top) found = i;
            }
        }
    });
    return found;
}

/** A letter as *Find* compares it: no accent, no case. */
const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Where `query` is in `text`, whatever the case and the accents, in `text`'s own positions. */
export function matchSpan(text: string, query: string): Span | null {
    const wanted = fold(query.trim());
    if (!wanted) return null;
    // Each letter of the text, folded, with the position it came from.
    let folded = "";
    const from: number[] = [];
    for (let i = 0; i < text.length; i++) {
        const piece = fold(text[i]);
        for (let k = 0; k < piece.length; k++) from.push(i);
        folded += piece;
    }
    const at = folded.indexOf(wanted);
    if (at < 0) return null;
    return [from[at], from[at + wanted.length - 1] + 1];
}

/**
 * The contents that match `query` (FR-16): a row that matches keeps all its sections; a row whose
 * sections match keeps only those; a band stays only while it holds a match. An empty query is the
 * whole shape, as it was.
 */
export function filterShape(groups: ContentsGroup[], query: string): ContentsGroup[] {
    if (!query.trim()) return groups;
    const found: ContentsGroup[] = [];
    for (const group of groups) {
        const rows: ContentsRow[] = [];
        for (const row of group.rows) {
            const hit = matchSpan(row.title, query);
            const sections = row.sections.map((section) => withHit(section, matchSpan(section.title, query)));
            const kept = hit ? sections : sections.filter((section) => section.hit);
            if (hit || kept.length > 0) rows.push({ ...withHit(row, hit), sections: kept });
        }
        if (rows.length > 0) found.push({ ...group, rows });
    }
    return found;
}

function withHit<T extends { hit?: Span }>(item: T, hit: Span | null): T {
    const rest = { ...item };
    delete rest.hit;
    return hit ? { ...rest, hit } : rest;
}
