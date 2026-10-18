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

/** Draw a page's blocks into `into`, in order. */
export function drawBlocks(into: HTMLElement, blocks: readonly PageBlock[]): void {
    for (const block of blocks) {
        if (block.kind === "heading") into.createEl("h2").appendText(block.text);
        else if (block.kind === "listing") into.createEl("pre").createEl("code").appendText(block.text);
        else inline(into.createEl("p"), block.text, [...(block.spans ?? [])].sort((p, q) => p.start - q.start), 0, block.text.length);
    }
}
