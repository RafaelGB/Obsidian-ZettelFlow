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

/** Every text node under `root`, in reading order. */
export function textNodes(root: NodeLike): TextLike[] {
    const out: TextLike[] = [];
    const walk = (node: NodeLike) => {
        if (node.nodeType === TEXT_NODE) {
            out.push(node as TextLike);
            return;
        }
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

/**
 * Wrap `span` of `root`'s text in marks made by `makeMark`, one per text node it covers. A piece
 * that is only whitespace (the gap between two paragraphs) is left alone: there is nothing to see,
 * and a mark between block elements would only disturb the layout.
 */
export function wrapSpan(root: NodeLike, span: TextSpan, makeMark: () => ParentLike): ParentLike[] {
    const marks: ParentLike[] = [];
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
