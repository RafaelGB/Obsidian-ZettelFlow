import type { TextSpan } from "application/thinking/quoteAnchor";

/**
 * Drawing highlights over a rendered chapter (#671), without ever touching the note.
 *
 * A chapter is whatever Obsidian's Markdown renderer produced — paragraphs, lists, callouts, links.
 * A highlight is a span of that chapter's **text** (its text nodes, read in order), and drawing it
 * means wrapping the covered part of each text node in a `<mark>`: one mark per text node, so a
 * passage that crosses a link or a bold word is drawn as several marks of the same highlight.
 *
 * Written against the few DOM members it needs, so a test can drive it with a small stand-in.
 */

/** A text node, as far as this module is concerned. */
export interface TextLike {
    nodeType: number;
    data: string;
    parentNode: ParentLike | null;
    splitText(offset: number): TextLike;
}

/** An element that can hold and lose children. */
export interface ParentLike {
    nodeType: number;
    /** Present on real elements: what kind of element it is (svg, style, script are skipped). */
    nodeName?: string;
    /** Present on real elements: a peek card is not part of the chapter's text. */
    classList?: { contains(name: string): boolean };
    /** Present on real elements: a book's drawing is flagged `data-zf-drawing` by the sanitiser (#770). */
    getAttribute?(name: string): string | null;
    childNodes: ArrayLike<NodeLike>;
    firstChild: NodeLike | null;
    parentNode: ParentLike | null;
    insertBefore(node: NodeLike, ref: NodeLike | null): unknown;
    appendChild(node: NodeLike): unknown;
    removeChild(node: NodeLike): unknown;
    normalize?(): void;
}

export type NodeLike = TextLike | ParentLike;

const TEXT_NODE = 3;

/**
 * Elements whose text is not the chapter's: an icon (Obsidian draws its icons as SVG in a note),
 * styles, scripts, and an open peek card. A book's own drawing is the exception (#770): the
 * sanitiser flags it `data-zf-drawing`, and its labels are read like any other words.
 */
const SKIPPED = new Set(["svg", "style", "script"]);
const PEEK_CLASS = "zettelkasten-flow__reader-peek";
const DRAWING_FLAG = "data-zf-drawing";

function skipped(node: ParentLike): boolean {
    const name = node.nodeName?.toLowerCase();
    if (name === "svg" && node.getAttribute?.(DRAWING_FLAG) != null) return false;
    if (name && SKIPPED.has(name)) return true;
    return node.classList?.contains(PEEK_CLASS) === true;
}

/** Equations and drawings: a mark is never wrapped inside one (#770). */
const FOREIGN = new Set(["math", "svg"]);

/** The outermost equation or drawing `node` is inside, below `root` — or `null`. */
function foreignRootOf(node: TextLike, root: NodeLike): ParentLike | null {
    let found: ParentLike | null = null;
    for (let at = node.parentNode; at && (at as NodeLike) !== root; at = at.parentNode) {
        if (at.nodeName && FOREIGN.has(at.nodeName.toLowerCase())) found = at;
    }
    return found;
}

/** Every text node under `root`, in reading order — never inside an icon, a script or a peek. */
export function textNodes(root: NodeLike): TextLike[] {
    const out: TextLike[] = [];
    const walk = (node: NodeLike) => {
        if (node.nodeType === TEXT_NODE) {
            out.push(node as TextLike);
            return;
        }
        if (node !== root && skipped(node as ParentLike)) return;
        const children = (node as ParentLike).childNodes;
        if (!children) return;
        for (let i = 0; i < children.length; i++) walk(children[i]);
    };
    walk(root);
    return out;
}

/** The chapter's text as the highlights see it: its text nodes, joined. */
export function chapterText(root: NodeLike): string {
    return textNodes(root)
        .map((node) => node.data)
        .join("");
}

/** Elements whose text starts a new block: what a reader sees as a break, and a search must too. */
const BLOCKS = new Set(["p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "td", "th", "dt", "dd", "figcaption", "section", "aside", "article", "tr", "svg", "text"]);

function blockOf(node: NodeLike, root: NodeLike): NodeLike | null {
    let at = (node as TextLike).parentNode as unknown as NodeLike | null;
    while (at && at !== root) {
        const name = (at as ParentLike).nodeName?.toLowerCase();
        if (name && BLOCKS.has(name)) return at;
        at = (at as unknown as TextLike).parentNode;
    }
    return root;
}

/**
 * The chapter's text as a reader sees it (#719): the same text nodes as `chapterText`, with a space
 * where one block ends and the next begins — so two paragraphs never run into one word, in a search
 * or in its snippets. Not for highlight offsets: those are `chapterText`'s.
 */
export function readableText(root: NodeLike): string {
    return readableWithMap(root).text;
}

/**
 * The readable text, and the way back from one of its offsets to `chapterText`'s — so a match found
 * across two blocks is drawn on the page with `wrapSpan` all the same.
 */
export function readableWithMap(root: NodeLike): { text: string; toChapter: (offset: number) => number } {
    let out = "";
    const inserted: number[] = [];
    let block: NodeLike | null = null;
    for (const node of textNodes(root)) {
        const here = blockOf(node, root);
        if (block !== null && here !== block && out && !/\s$/.test(out) && !/^\s/.test(node.data)) {
            inserted.push(out.length);
            out += " ";
        }
        out += node.data;
        block = here;
    }
    return {
        text: out,
        toChapter: (offset) => offset - inserted.filter((at) => at < offset).length,
    };
}

/**
 * Wrap `span` of `root`'s text in marks made by `makeMark`, one per text node it covers. A piece
 * that is only whitespace (the gap between two paragraphs) is left alone: there is nothing to see,
 * and a mark between block elements would only disturb the layout.
 *
 * Inside an equation or a drawing (#770) nothing is wrapped — an HTML mark in an `<mi>` loses the
 * identifier's italic, one in an SVG `<text>` does not paint — but its text still counts towards
 * the offsets; `onForeign` is called once for each such root the span covers, to tint it whole.
 */
export function wrapSpan(root: NodeLike, span: TextSpan, makeMark: () => ParentLike, onForeign?: (foreign: ParentLike) => void): ParentLike[] {
    const marks: ParentLike[] = [];
    const tinted = new Set<ParentLike>();
    let pos = 0;
    for (const node of textNodes(root)) {
        const length = node.data.length;
        const nodeStart = pos;
        const nodeEnd = pos + length;
        pos = nodeEnd;
        if (nodeEnd <= span.start || nodeStart >= span.end || length === 0) continue;
        const from = Math.max(span.start, nodeStart) - nodeStart;
        const to = Math.min(span.end, nodeEnd) - nodeStart;
        if (to <= from || !node.data.slice(from, to).trim()) continue;
        const foreign = foreignRootOf(node, root);
        if (foreign) {
            if (!tinted.has(foreign)) {
                tinted.add(foreign);
                onForeign?.(foreign);
            }
            continue;
        }
        let target = node;
        if (from > 0) target = target.splitText(from);
        if (to - from < target.data.length) target.splitText(to - from);
        const parent = target.parentNode;
        if (!parent) continue;
        const mark = makeMark();
        parent.insertBefore(mark, target);
        mark.appendChild(target);
        marks.push(mark);
    }
    return marks;
}

/** Take a mark away, leaving its text exactly where it was. */
export function unwrapMark(mark: ParentLike): void {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize?.();
}

/**
 * Where a DOM position is in `chapterText(root)` (#761): a caret in a text node, or before the
 * `offset`-th child of an element (the first text from there on). `null` when it is not in `root`.
 * One walk in reading order, the way `textNodes` reads the chapter.
 */
export function offsetAt(root: NodeLike, node: NodeLike | null, offset = 0): number | null {
    if (!node) return null;
    const isText = node.nodeType === TEXT_NODE;
    // An element: the caret sits before that child, or after the last one.
    const children = isText ? null : (node as ParentLike).childNodes;
    const start: NodeLike = isText ? node : (children?.[offset] ?? node);
    const afterAll = !isText && !children?.[offset];
    let pos = 0;
    let reached = false;
    let answer: number | null = null;
    const walk = (at: NodeLike): boolean => {
        if (at === start && !afterAll) reached = true;
        if (at.nodeType === TEXT_NODE) {
            const text = at as TextLike;
            if (at === node) {
                answer = pos + Math.max(0, Math.min(offset, text.data.length));
                return true;
            }
            if (reached && !isText) {
                answer = pos;
                return true;
            }
            pos += text.data.length;
            return false;
        }
        if (at !== root && skipped(at as ParentLike)) return false;
        const kids = (at as ParentLike).childNodes;
        if (kids) for (let i = 0; i < kids.length; i++) if (walk(kids[i])) return true;
        // Past the end of the element the caret is after: the next text is where it is.
        if (at === start && afterAll) reached = true;
        return false;
    };
    walk(root);
    if (answer !== null) return answer;
    return reached && !isText ? pos : null;
}

/** The text node, and the offset in it, where `chapterText(root)`'s `offset` falls. */
export function pointAt(root: NodeLike, offset: number): { node: TextLike; offset: number } | null {
    let pos = 0;
    let last: TextLike | null = null;
    for (const text of textNodes(root)) {
        const end = pos + text.data.length;
        if (offset < end) return { node: text, offset: Math.max(0, offset - pos) };
        pos = end;
        last = text;
    }
    return last ? { node: last, offset: last.data.length } : null;
}
