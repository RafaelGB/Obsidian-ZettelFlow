import { c } from "architecture";
import { t } from "architecture/lang";
import { codeLanguageName } from "application/library/codeLanguage";

/**
 * **Code in a book, drawn as code** (#824, epic #827).
 *
 * A listing the sanitiser kept (`pre`, its language as `data-zf-code`) is coloured with the Prism
 * Obsidian ships — through `Prism.tokenize`, never the HTML string `Prism.highlight` returns: every
 * piece is a `createSpan` with Prism's own `token <type>` classes, which Obsidian colours from the
 * theme's `--code-*` variables everywhere. So a keyword in a book is the colour of the same keyword in
 * a note, by construction.
 *
 * And it is cut into **lines**, inside **runs**: `pre > (code >) run > line`. A run is the box that
 * scrolls sideways and is kept whole on a page; a listing taller than a page is split into several runs
 * by the pager (`splitListing`), each but the last saying it continues. The text is never touched: every
 * character stays where it was, each line keeping its own `\n`, so the chapter's text, a saved highlight's
 * place and a search are the same before and after.
 */

/** What the Reader needs of Prism: its grammars, and its tokenizer. */
export interface PrismLike {
    languages: Record<string, unknown>;
    tokenize(text: string, grammar: unknown): unknown[];
}

interface TokenLike {
    type: string;
    content: unknown;
    alias?: string | string[];
}

export interface CodeSegment {
    text: string;
    /** Prism's token types around it, outermost first, aliases included; none for plain text. */
    types: string[];
}

export interface CodeLine {
    segments: CodeSegment[];
    /** The line's leading indentation, in columns (a tab is four). */
    indent: number;
}

const TAB = 4;

function isToken(value: unknown): value is TokenLike {
    return typeof value === "object" && value !== null && typeof (value as TokenLike).type === "string" && "content" in (value);
}

/** Prism's stream as flat segments, each with the token types it sits in. */
function flatten(stream: unknown, types: string[], out: CodeSegment[]): void {
    if (typeof stream === "string") {
        if (stream) out.push({ text: stream, types });
        return;
    }
    if (Array.isArray(stream)) {
        for (const part of stream) flatten(part, types, out);
        return;
    }
    if (isToken(stream)) {
        const alias = stream.alias ? (Array.isArray(stream.alias) ? stream.alias : [stream.alias]) : [];
        flatten(stream.content, [...types, stream.type, ...alias], out);
    }
}

function indentOf(text: string): number {
    let columns = 0;
    for (const char of text) {
        if (char === " ") columns++;
        else if (char === "\t") columns += TAB - (columns % TAB);
        else break;
    }
    return columns;
}

/**
 * A listing's text as lines (pure): each with its segments and its indent. A token that runs over a
 * line's end (a comment, a string) is cut there, its types kept on both sides. Every `\n` stays, at the
 * end of its line, so the lines joined are the text exactly.
 */
export function codeLines(text: string, tokens: unknown[] = [text]): CodeLine[] {
    const segments: CodeSegment[] = [];
    flatten(tokens, [], segments);
    const lines: CodeLine[] = [];
    let current: CodeSegment[] = [];
    let raw = "";
    const end = () => {
        lines.push({ segments: current, indent: indentOf(raw) });
        current = [];
        raw = "";
    };
    for (const segment of segments) {
        const parts = segment.text.split("\n");
        parts.forEach((part, i) => {
            const last = i === parts.length - 1;
            const piece = last ? part : `${part}\n`;
            if (piece) {
                current.push({ text: piece, types: segment.types });
                raw += piece;
            }
            if (!last) end();
        });
    }
    if (current.length > 0) end();
    return lines;
}

/** Inline wrappers a listing's own markup leaves (a publisher's colouring, emphasis): flattened. */
const PLAIN = new Set(["span", "b", "i", "em", "strong", "u", "code", "s", "small"]);

const ELEMENT_NODE = 1;

/** An element's element children, read through `childNodes` as the DOM keeps them. */
function elementsOf(el: Node): Element[] {
    return Array.from(el.childNodes).filter((child): child is Element => child.nodeType === ELEMENT_NODE);
}

/** Whether a listing holds only text and plain wrappers — so it can be cut into lines. */
function plainInside(el: Element): boolean {
    for (const child of elementsOf(el)) {
        const tag = child.tagName.toLowerCase();
        if (!PLAIN.has(tag) || child.attributes.length > 0) return false;
        if (!plainInside(child)) return false;
    }
    return true;
}

/** The element a listing's lines go in: its one `code`, or the `pre` itself. */
function holderOf(pre: HTMLElement): HTMLElement {
    const elements = elementsOf(pre);
    const only = elements.length === 1 ? (elements[0] as HTMLElement) : null;
    return only && only.tagName.toLowerCase() === "code" && (pre.textContent ?? "") === (only.textContent ?? "") ? only : pre;
}

/** The listing's language, as the id it is coloured by: on the `pre`, or on its `code`. */
export function listingLanguage(pre: Element): string | null {
    return pre.getAttribute("data-zf-code") ?? pre.querySelector("code")?.getAttribute("data-zf-code") ?? null;
}

/**
 * Colour and cut every listing under `root` — before it is on the page, so nothing is ever seen
 * uncoloured (#824 AC-M3). `prism` is null where Obsidian's could not be loaded: the listings are still
 * lines and runs, monospace and uncoloured. Returns how many listings the chapter has.
 */
export function colourListings(root: HTMLElement, prism: PrismLike | null): number {
    let listings = 0;
    for (const pre of Array.from(root.querySelectorAll<HTMLElement>("pre"))) {
        listings++;
        pre.addClass(c("reader-code"));
        const language = listingLanguage(pre);
        // A named group: `aria-label` on a bare `pre` is ignored by screen readers.
        pre.setAttribute("role", "group");
        pre.setAttribute("aria-label", language ? t("reader_code_listing", codeLanguageName(language)) : t("reader_code_listing_plain"));
        const holder = holderOf(pre);
        // A callout, a link or an anchor inside: the listing is left as the book drew it, whole.
        if (!plainInside(holder)) continue;
        const text = holder.textContent ?? "";
        const grammar = language && prism && typeof prism.tokenize === "function" ? prism.languages[language] : undefined;
        let tokens: unknown[] = [text];
        if (grammar && typeof grammar === "object") {
            try {
                tokens = prism!.tokenize(text, grammar);
            } catch {
                tokens = [text];
            }
        }
        holder.empty();
        const run = holder.createSpan({ cls: c("reader-code-run") });
        for (const line of codeLines(text, tokens)) {
            const el = run.createSpan({ cls: c("reader-code-line") });
            if (line.indent > 0) el.setCssProps({ "--zf-indent": String(line.indent) });
            for (const segment of line.segments) {
                if (segment.types.length === 0) el.appendText(segment.text);
                else el.createSpan({ cls: ["token", ...segment.types] }).appendText(segment.text);
            }
        }
    }
    return listings;
}

const RUN = "reader-code-run";
const CONTINUES = "data-zf-continues";

/** A listing's runs, in order. */
export function runsOf(pre: Element): HTMLElement[] {
    return Array.from(pre.querySelectorAll<HTMLElement>(`.${c(RUN)}`));
}

/** A listing back to one run (#824 FR-7): what it is in *Scroll*, and what a split starts from. */
export function mergeListing(pre: HTMLElement): void {
    const runs = runsOf(pre);
    if (runs.length < 2) {
        runs[0]?.removeAttribute(CONTINUES);
        return;
    }
    const [first, ...rest] = runs;
    for (const run of rest) {
        // A run holds lines and nothing else: its element children are all of it.
        for (const line of Array.from(run.children)) first.appendChild(line);
        run.remove();
    }
    first.removeAttribute(CONTINUES);
}

/**
 * Cut a listing into runs of `counts` lines each (#824 FR-7): whole lines move, so a highlight inside
 * a line is never cut, and every run but the last says the listing continues.
 */
export function splitListing(pre: HTMLElement, counts: number[]): void {
    mergeListing(pre);
    const [first] = runsOf(pre);
    if (!first || counts.length < 2) return;
    const lines = Array.from(first.children) as HTMLElement[];
    let at = counts[0];
    let previous = first;
    for (const count of counts.slice(1)) {
        if (at >= lines.length) break;
        previous.setAttribute(CONTINUES, t("reader_code_continues"));
        const run = (first.parentElement as HTMLElement).createSpan({ cls: c(RUN) });
        previous.after(run);
        for (const line of lines.slice(at, at + count)) run.appendChild(line);
        at += count;
        previous = run;
    }
}
