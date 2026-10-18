import { c } from "architecture";
import type { InlineSpan, PageBlock, SpanKind } from "application/library/pdfText";

/**
 * **A reflowed PDF page, drawn** (epic #836): its blocks as the elements they are — a heading, a
 * paragraph, a listing — and the formats inside their words. The text is the blocks' text, character
 * for character: an element only wraps it, so what the highlighter reads is what Page view indexes.
 *
 * A listing is drawn as `pre > code` holding its lines; the caller colours and cuts it with #824's
 * `colourListings`, so a PDF's code is the same listing an EPUB's is.
 */

/** The formats inside a block, outermost first: a crossing one is split at the edges of the outer. */
const NESTING: readonly SpanKind[] = ["link", "strong", "em", "code", "sup"];

const TAG: Record<SpanKind, keyof HTMLElementTagNameMap> = { link: "a", strong: "strong", em: "em", code: "code", sup: "sup" };

/** `text[from, to)` into `parent`, each format from `depth` on wrapping the characters it covers. */
function inline(parent: HTMLElement, text: string, spans: readonly InlineSpan[], from: number, to: number, depth = 0): void {
    if (from >= to) return;
    if (depth === NESTING.length) {
        parent.appendText(text.slice(from, to));
        return;
    }
    const kind = NESTING[depth];
    let at = from;
    for (const span of spans) {
        if (span.kind !== kind || span.end <= at || span.start >= to) continue;
        const start = Math.max(span.start, at);
        const end = Math.min(span.end, to);
        inline(parent, text, spans, at, start, depth + 1);
        inline(parent.createEl(TAG[kind]), text, spans, start, end, depth + 1);
        at = end;
    }
    inline(parent, text, spans, at, to, depth + 1);
}

/** Whether a page's blocks are only what the reading view always drew: headings and plain paragraphs. */
export function plainBlocks(blocks: readonly PageBlock[]): boolean {
    return blocks.every((block) => (block.kind === "heading" || block.kind === "paragraph") && !block.spans?.length);
}

/** A block's words from `from` on, with their formats. */
function words(parent: HTMLElement, block: PageBlock, from = 0): void {
    inline(parent, block.text, [...(block.spans ?? [])].sort((p, q) => p.start - q.start), from, block.text.length);
}

/** An open list while a page's items are drawn: its depth, its order, and the item last added to it. */
interface OpenList {
    level: number;
    ordered: boolean;
    el: HTMLElement;
    item: HTMLElement | null;
}

/**
 * An item into the lists open above it (#838): a deeper one opens a list inside the item before it,
 * a shallower one closes lists back to its own. The marker is the page's own characters, hanging in
 * the margin — never a counter the stylesheet draws, so it is never drawn twice or renumbered.
 */
function drawItem(into: HTMLElement, open: OpenList[], block: PageBlock): void {
    const level = block.level ?? 0;
    if (block.cont && open.length > 0 && open[open.length - 1].item) {
        words(open[open.length - 1].item!.createDiv({ cls: c("reader-pdf-part") }), block);
        return;
    }
    while (open.length > 0 && open[open.length - 1].level > level) open.pop();
    const top = open[open.length - 1];
    if (top && top.level === level && top.ordered !== Boolean(block.ordered)) open.pop();
    let list = open[open.length - 1];
    if (!list || list.level < level) {
        const parent = list?.item ?? into;
        list = { level, ordered: Boolean(block.ordered), el: parent.createEl(block.ordered ? "ol" : "ul", { cls: c("reader-pdf-list") }), item: null };
        open.push(list);
    }
    const item = list.el.createEl("li", { cls: c("reader-pdf-item") });
    const marker = block.marker ?? 0;
    item.createSpan({ cls: c("reader-pdf-marker") }).appendText(block.text.slice(0, marker));
    words(item.createSpan({ cls: c("reader-pdf-item-text") }), block, marker);
    list.item = item;
}

/** Draw a page's blocks into `into`, in order. */
export function drawBlocks(into: HTMLElement, blocks: readonly PageBlock[]): void {
    let open: OpenList[] = [];
    for (const block of blocks) {
        if (block.kind === "item") {
            drawItem(into, open, block);
            continue;
        }
        open = [];
        if (block.kind === "heading") into.createEl("h2").appendText(block.text);
        else if (block.kind === "listing") into.createEl("pre").createEl("code").appendText(block.text);
        else words(into.createEl("p"), block);
    }
}
