import { leavesTheBook, resolveHref, type EpubPackage, type RenditionSpread, type SpineItem } from "./epubPackage";
import type { SourceNode } from "./epubSanitize";

/**
 * **Fixed-layout books** (#771, epic #739) — pure. A comic, a picture book or a cookbook declares its
 * pages *pre-paginated*: every word and picture sits where the designer put it, in the book's own
 * styles, on a page of the size it declares. This module reads what the book declares, pairs its pages
 * the way it says, and **cleans the book's CSS** so that what is left can only draw its own page.
 *
 * The cleaner is the security boundary of a designed page (FR-4), with the sanitiser (`epubSanitize`)
 * for its markup. The shadow root a page is drawn in (`epubDesigned`) keeps the page's look *inside*
 * it, and is never relied on for anything else. What the cleaner lets through:
 *
 * - **A closed list of CSS functions.** Anything not on it drops its declaration: `image-set()`,
 *   `src()`, `image()`, `cross-fade()`, `element()`, `paint()`, `attr()`, `env()`, `expression()`…
 * - **`url()` only to a file inside the book**, made a placeholder the caller binds to a `blob:` URL
 *   it minted from the archive's bytes. A scheme, `//`, `data:` or `#` drops the declaration.
 * - **No backslash anywhere** — a CSS escape (`u\72l(`, `\@import`) is how a filter is fooled. A
 *   declaration or a selector holding one is dropped.
 * - **No at-rule but `@media` and `@supports`.** `@font-face` is taken out and handed back: its font is
 *   read from the archive by the caller, under a name of ours, never by the platform from a URL.
 * - **Nothing aimed outside the page**: `:host`, `::slotted`, `::part`; and nothing that moves, runs
 *   or binds: `animation*`, `transition*`, `behavior`, `-moz-binding`, `pointer-events`, `user-select`.
 *
 * `defendRules` then reads the sheet as the platform parsed it and deletes any rule that still names
 * a URL we did not mint, imports, declares a font or a namespace, reaches the host (`:host`, `:scope`,
 * `&`) or calls a function that fetches — the second check, after parsing.
 */

// ── what the book declares ────────────────────────────────────────────────

export interface PageSize {
    width: number;
    height: number;
}

/** The size of a page that declares none (a spec gap of #771, settled: a portrait tablet's). */
export const DEFAULT_PAGE: PageSize = { width: 768, height: 1024 };

/** A declared page side larger than this is not a page: the default is used. */
const MAX_SIDE = 10_000;

/** Whether spine item `index` is a designed page: its own declaration, else the book's (FR-1, AC-1). */
export function layoutOf(pkg: Pick<EpubPackage, "rendition">, item: Pick<SpineItem, "properties"> | undefined): "pre-paginated" | "reflowable" {
    const own = item?.properties ?? [];
    if (own.includes("rendition:layout-pre-paginated")) return "pre-paginated";
    if (own.includes("rendition:layout-reflowable")) return "reflowable";
    return pkg.rendition?.layout === "pre-paginated" ? "pre-paginated" : "reflowable";
}

/** `width=600, height=800` (or `width=600,height=800`, `width=600px; height=800px`) as a size, or null. */
export function viewportOf(content: string | null | undefined): PageSize | null {
    if (!content) return null;
    const text = content.toLowerCase();
    const width = numberAfter(text, "width");
    const height = numberAfter(text, "height");
    if (width === null || height === null) return null;
    return { width, height };
}

function numberAfter(text: string, name: string): number | null {
    const at = text.indexOf(name);
    if (at < 0) return null;
    let i = at + name.length;
    while (i < text.length && (text[i] === " " || text[i] === "=" || text[i] === ":")) i++;
    let digits = "";
    while (i < text.length && /[\d.]/.test(text[i]) && digits.length < 12) digits += text[i++];
    const n = Number(digits);
    return Number.isFinite(n) && n >= 1 && n <= MAX_SIDE ? Math.round(n * 100) / 100 : null;
}

/** An SVG page's size: its `viewBox`, else its `width` and `height` in plain numbers. */
export function svgPageSize(svg: SourceNode): PageSize | null {
    const box = (attrOf(svg, "viewBox") ?? attrOf(svg, "viewbox") ?? "").trim().split(/[\s,]+/).map(Number);
    if (box.length === 4 && box.every(Number.isFinite) && box[2] >= 1 && box[3] >= 1 && box[2] <= MAX_SIDE && box[3] <= MAX_SIDE) return { width: box[2], height: box[3] };
    const width = Number(attrOf(svg, "width") ?? "");
    const height = Number(attrOf(svg, "height") ?? "");
    if (width >= 1 && height >= 1 && width <= MAX_SIDE && height <= MAX_SIDE) return { width, height };
    return null;
}

/** A page's size (AC-1): what the page says, else what the package says, else the default. */
export function pageSize(own: PageSize | null | undefined, pkg: Pick<EpubPackage, "rendition">): PageSize {
    return own ?? viewportOf(pkg.rendition?.viewport) ?? { ...DEFAULT_PAGE };
}

/** What the head of a designed page holds: its declared size, and its styles inside the book. */
export interface DesignedHead {
    viewport: PageSize | null;
    /** The archive paths of its `<link rel="stylesheet">` inside the book, in order. */
    sheets: string[];
    /** The text of its `<style>` elements, in order. */
    styles: string[];
}

/**
 * The head of a designed page, read before its body is rebuilt (FR-2, FR-4): the `viewport` meta, the
 * style sheets it links to *inside the book* (one that leaves it is ignored), and its `<style>` text.
 * None of these elements is ever made: their text is cleaned and adopted instead.
 */
export function designedHead(root: SourceNode, chapterHref: string): DesignedHead {
    const out: DesignedHead = { viewport: null, sheets: [], styles: [] };
    const head = childNamed(root, "head");
    if (!head) return out;
    for (let i = 0; i < head.childNodes.length; i++) {
        const node = head.childNodes[i];
        if (node.nodeType !== 1) continue;
        const name = nameOf(node);
        if (name === "meta" && (attrOf(node, "name") ?? "").toLowerCase() === "viewport") out.viewport ??= viewportOf(attrOf(node, "content"));
        else if (name === "link") {
            const rel = (attrOf(node, "rel") ?? "").toLowerCase().split(/\s+/);
            const href = (attrOf(node, "href") ?? "").trim();
            if (rel.includes("stylesheet") && !rel.includes("alternate") && href && !leavesTheBook(href) && !href.startsWith("#")) out.sheets.push(resolveHref(chapterHref, href));
        } else if (name === "style") out.styles.push(node.textContent ?? "");
    }
    return out;
}

function nameOf(node: SourceNode): string {
    const raw = node.localName ?? node.nodeName;
    const colon = raw.indexOf(":");
    return (colon >= 0 ? raw.slice(colon + 1) : raw).toLowerCase();
}

function attrOf(node: SourceNode, name: string): string | null {
    const direct = node.getAttribute?.(name);
    if (direct !== undefined && direct !== null) return direct;
    const list = node.attributes;
    if (!list) return null;
    for (let i = 0; i < list.length; i++) if (list[i].name === name) return list[i].value;
    return null;
}

function childNamed(node: SourceNode, name: string): SourceNode | null {
    for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes[i];
        if (child.nodeType === 1 && nameOf(child) === name) return child;
    }
    return null;
}

// ── spreads ──────────────────────────────────────────────────────────────

/** A view in *Spread*: its pages in reading order, and — for a page alone — the side it sits on. */
export interface SpreadView {
    pages: number[];
    /** A page alone sits on this side of the spine; centred when absent (`page-spread-center`). */
    side?: "left" | "right";
}

/** Which side a spine item says it sits on: `page-spread-left`, `-right`, `-center` (also `rendition:`). */
export function spreadSide(item: Pick<SpineItem, "properties"> | undefined): "left" | "right" | "center" | undefined {
    for (const property of item?.properties ?? []) {
        const p = property.startsWith("rendition:") ? property.slice("rendition:".length) : property;
        if (p === "page-spread-left") return "left";
        if (p === "page-spread-right") return "right";
        if (p === "page-spread-center" || p === "spread-center") return "center";
    }
    return undefined;
}

export interface SpreadOptions {
    direction: "ltr" | "rtl";
    /** The book's `rendition:spread`; `auto` when it says nothing. */
    spread: RenditionSpread;
    /** The reading is wider than it is tall. */
    landscape: boolean;
    /** The reader chose *Spread* themselves: it wins over the orientation (a spec gap, settled). */
    explicit: boolean;
}

/** Whether two pages may sit together now (FR-6): never with `none`; `landscape` only in landscape. */
export function spreadAllowed(options: Pick<SpreadOptions, "spread" | "landscape" | "explicit">): boolean {
    if (options.spread === "none") return false;
    if (options.spread === "landscape") return options.landscape;
    return options.explicit || options.spread === "both" || options.landscape;
}

/**
 * The book's pages paired as it says (FR-6, AC-2). In reading order the first slot of a spread is the
 * left page (the right one in a right-to-left book). A page declared for the second slot with none
 * before it stands alone there — a first page `page-spread-right` opens alone, as a printed book does;
 * `page-spread-center` always stands alone, centred. With pairing not allowed, every page is alone.
 */
export function pairSpreads(sides: readonly ("left" | "right" | "center" | undefined)[], options: SpreadOptions): SpreadView[] {
    const views: SpreadView[] = [];
    if (!spreadAllowed(options)) {
        for (let i = 0; i < sides.length; i++) views.push({ pages: [i] });
        return views;
    }
    const first = options.direction === "rtl" ? "right" : "left";
    const second = options.direction === "rtl" ? "left" : "right";
    let pending: number | null = null;
    const flush = () => {
        if (pending !== null) views.push({ pages: [pending], side: first });
        pending = null;
    };
    sides.forEach((side, page) => {
        if (side === "center") {
            flush();
            views.push({ pages: [page] });
            return;
        }
        if (pending === null) {
            if (side === second) views.push({ pages: [page], side: second });
            else pending = page;
            return;
        }
        if (side === first) {
            flush();
            pending = page;
            return;
        }
        views.push({ pages: [pending, page] });
        pending = null;
    });
    flush();
    return views;
}

// ── the book's CSS, cleaned ──────────────────────────────────────────────

/** A stylesheet past this is not a page's: the page fails calmly (FR-10). */
export const MAX_CSS_BYTES = 512 * 1024;
/** Rules past this, likewise. */
export const MAX_CSS_RULES = 5000;

/** The CSS functions a designed page may use. Anything else drops its declaration (closed list). */
const FUNCTIONS = new Set([
    "url", "var", "calc", "min", "max", "clamp", "round", "mod", "rem", "abs", "sign",
    "rgb", "rgba", "hsl", "hsla", "hwb", "lab", "lch", "oklab", "oklch", "color", "color-mix", "light-dark",
    "linear-gradient", "radial-gradient", "conic-gradient", "repeating-linear-gradient", "repeating-radial-gradient", "repeating-conic-gradient",
    "translate", "translatex", "translatey", "translatez", "translate3d", "scale", "scalex", "scaley", "scalez", "scale3d",
    "rotate", "rotatex", "rotatey", "rotatez", "rotate3d", "skew", "skewx", "skewy", "matrix", "matrix3d", "perspective",
    "cubic-bezier", "steps", "rect", "inset", "circle", "ellipse", "polygon",
    "blur", "brightness", "contrast", "drop-shadow", "grayscale", "hue-rotate", "invert", "opacity", "saturate", "sepia",
    "minmax", "repeat", "fit-content", "counter", "counters", "format", "local",
]);

/** Declarations dropped whatever their value: motion that would play, and what binds or reaches out. */
const DROPPED = new Set(["behavior", "binding", "user-select", "touch-callout", "pointer-events", "will-change", "user-modify", "view-transition-name"]);

/** The files one page may name in its CSS (#771 review S4): past this the page fails calmly. */
export const MAX_CSS_ASSETS = 1000;

/** The positions a page may use: its boxes stay in its page (`fixed` and `sticky` become `absolute`). */
const POSITIONS = new Set(["static", "relative", "absolute"]);

/** A font the book carries, as it is loaded: our name for it, and the file inside the book. */
export interface DesignedFont {
    family: string;
    path: string;
    weight?: string;
    style?: string;
}

/** What cleaning gathers across a book: its fonts' names (shared by its pages) and their files. */
export interface DesignedCssBook {
    /** Stable for the book: what its fonts are named after (`zf-fxl-<key>-<n>`). */
    key: string;
    /** A family the book declares (lower-cased) → our name for it. */
    families: Map<string, string>;
    /** Every face found so far, in order; the caller loads the ones it has not. */
    fonts: DesignedFont[];
}

export function designedCssBook(key: string): DesignedCssBook {
    return { key: key.replace(/[^a-z0-9]/gi, "").slice(0, 12).toLowerCase() || "book", families: new Map(), fonts: [] };
}

/** A page's style inputs: its sheets (their text and where they sit) and its inline `style` attributes. */
export interface DesignedCssInput {
    sheets: { text: string; href: string }[];
    /** The page's `style` attributes, in order: the n-th becomes the rule `[data-zf-s="n"]`. */
    inline: string[];
    /** Where the page sits, for its inline styles' `url()`. */
    href: string;
}

export interface CleanedCss {
    css: string;
    /** The archive path of each `zf-asset:<n>` placeholder in `css`. */
    assets: string[];
    rules: number;
}

export class DesignedCssError extends Error {}

/**
 * The book's CSS for one page, cleaned (FR-2, FR-3, FR-4, FR-15; AC-3). Throws `DesignedCssError` past
 * the caps, which the page shows as its calm line (FR-10). `book` gathers the fonts across pages.
 */
export function cleanDesignedCss(input: DesignedCssInput, book: DesignedCssBook): CleanedCss {
    let bytes = input.inline.reduce((sum, text) => sum + text.length, 0);
    for (const sheet of input.sheets) bytes += sheet.text.length;
    if (bytes > MAX_CSS_BYTES) throw new DesignedCssError(`a page's styles are ${bytes} characters`);
    const assets: string[] = [];
    const parsed = input.sheets.map((sheet) => ({ href: sheet.href, nodes: parseBlocks(stripComments(sheet.text), 0) }));
    // Fonts first: a family is renamed wherever it is used, in any sheet of the page.
    for (const sheet of parsed) collectFonts(sheet.nodes, sheet.href, book);
    const ctx: Ctx = { book, assets, assetIndex: new Map(), rules: 0 };
    const out: string[] = [];
    for (const sheet of parsed) out.push(...serialize(sheet.nodes, sheet.href, ctx, 0));
    input.inline.forEach((text, i) => {
        const body = cleanDeclarations(stripComments(text), input.href, ctx);
        if (body) {
            ctx.rules++;
            out.push(`[data-zf-s="${i}"]{${body}}`);
        }
    });
    if (ctx.rules > MAX_CSS_RULES) throw new DesignedCssError(`a page has ${ctx.rules} style rules`);
    return { css: out.join("\n"), assets, rules: ctx.rules };
}

/** The placeholders bound to the URLs minted for them; one with no URL draws nothing (`none`). */
export function bindAssets(css: string, urls: readonly (string | null | undefined)[]): string {
    let out = "";
    let at = 0;
    const marker = 'url("zf-asset:';
    for (;;) {
        const i = css.indexOf(marker, at);
        if (i < 0) return out + css.slice(at);
        const end = css.indexOf('")', i + marker.length);
        if (end < 0) return out + css.slice(at);
        const n = Number(css.slice(i + marker.length, end));
        const url = Number.isInteger(n) ? urls[n] : undefined;
        out += css.slice(at, i) + (url && url.startsWith("blob:") && !/["\\\s)]/.test(url) ? `url("${url}")` : "none");
        at = end + 2;
    }
}

/** The little of a parsed rule (`CSSRule`) the second check reads. */
export interface RuleLike {
    cssText: string;
    cssRules?: ArrayLike<RuleLike>;
    deleteRule?(index: number): void;
}

export interface SheetLike {
    cssRules: ArrayLike<RuleLike>;
    deleteRule(index: number): void;
}

/**
 * The second check, after the platform parsed the sheet: any rule that names a URL we did not mint,
 * imports, declares a font or a namespace, or reaches the host or a part is deleted. Returns how many.
 */
export function defendRules(sheet: SheetLike, minted: ReadonlySet<string>): number {
    let deleted = 0;
    for (let i = sheet.cssRules.length - 1; i >= 0; i--) {
        const rule = sheet.cssRules[i];
        if (rule.cssRules && typeof rule.deleteRule === "function") deleted += defendRules(rule as SheetLike, minted);
        if (unsafeRule(rule.cssText, minted)) {
            sheet.deleteRule(i);
            deleted++;
        }
    }
    return deleted;
}

function unsafeRule(text: string, minted: ReadonlySet<string>): boolean {
    const lower = text.toLowerCase();
    if (lower.includes("@import") || lower.includes("@font-face") || lower.includes("@namespace")) return true;
    if (lower.includes(":host") || lower.includes("::slotted") || lower.includes("::part") || lower.includes(":scope")) return true;
    // A rule nesting under `&` at the top of a shadow tree's sheet would match its host (review S2).
    const brace = lower.indexOf("{");
    if (lower.slice(0, brace < 0 ? lower.length : brace).includes("&")) return true;
    // Every URL the platform parsed is one we minted — nothing else may be fetched (FR-4).
    for (let at = lower.indexOf("url("); at >= 0; at = lower.indexOf("url(", at + 4)) {
        const arg = urlArgument(text, at + 4);
        if (!arg || !minted.has(arg.value)) return true;
    }
    for (const name of ["image-set(", "src(", "image(", "cross-fade(", "element(", "paint(", "env(", "expression(", "attr("]) if (lower.includes(name)) return true;
    return false;
}

// ── the tokenizer ────────────────────────────────────────────────────────

interface Rule {
    kind: "rule";
    selector: string;
    body: string;
}

interface AtRule {
    kind: "at";
    name: string;
    prelude: string;
    body: string | null;
    /** `@media` and `@supports`: their rules, parsed. */
    children?: Node[];
}

type Node = Rule | AtRule;

interface Ctx {
    book: DesignedCssBook;
    assets: string[];
    /** Each asset's index, so a sheet of a thousand `url()`s is not quadratic (review S4). */
    assetIndex: Map<string, number>;
    rules: number;
}

/** Comments out, strings kept whole; the HTML comment tokens a `<style>` may carry are dropped too. */
function stripComments(text: string): string {
    let out = "";
    let i = 0;
    while (i < text.length) {
        const ch = text[i];
        if (ch === '"' || ch === "'") {
            const end = stringEnd(text, i);
            out += text.slice(i, end);
            i = end;
        } else if (ch === "/" && text[i + 1] === "*") {
            const end = text.indexOf("*/", i + 2);
            out += " ";
            i = end < 0 ? text.length : end + 2;
        } else if (text.startsWith("<!--", i)) {
            i += 4;
        } else if (text.startsWith("-->", i)) {
            i += 3;
        } else {
            out += ch;
            i++;
        }
    }
    return out;
}

/** The index just past the string starting at `i` (its quote), or the end of the line it breaks on. */
function stringEnd(text: string, i: number): number {
    const quote = text[i];
    let j = i + 1;
    while (j < text.length) {
        const ch = text[j];
        if (ch === "\\") j += 2;
        else if (ch === quote) return j + 1;
        else if (ch === "\n") return j;
        else j++;
    }
    return text.length;
}

/** The index of the next `stop` character at depth 0 (strings, parens and brackets skipped), or -1. */
function scanTo(text: string, from: number, stops: string): number {
    let depth = 0;
    let i = from;
    while (i < text.length) {
        const ch = text[i];
        if (ch === '"' || ch === "'") {
            i = stringEnd(text, i);
            continue;
        }
        if (ch === "(" || ch === "[") depth++;
        else if ((ch === ")" || ch === "]") && depth > 0) depth--;
        else if (depth === 0 && stops.includes(ch)) return i;
        i++;
    }
    return -1;
}

/** The index of the `}` closing the block opened at `open`, or -1. */
function blockEnd(text: string, open: number): number {
    let depth = 0;
    let i = open;
    while (i < text.length) {
        const ch = text[i];
        if (ch === '"' || ch === "'") {
            i = stringEnd(text, i);
            continue;
        }
        if (ch === "{") depth++;
        else if (ch === "}") {
            depth--;
            if (depth === 0) return i;
        }
        i++;
    }
    return -1;
}

const MAX_NESTING = 4;

function parseBlocks(text: string, depth: number): Node[] {
    const nodes: Node[] = [];
    let i = 0;
    while (i < text.length && nodes.length <= MAX_CSS_RULES) {
        while (i < text.length && /\s/.test(text[i])) i++;
        if (i >= text.length) break;
        if (text[i] === "}" || text[i] === ";") {
            i++;
            continue;
        }
        if (text[i] === "@") {
            let j = i + 1;
            while (j < text.length && /[\w-]/.test(text[j])) j++;
            const name = text.slice(i + 1, j).toLowerCase();
            const stop = scanTo(text, j, "{;");
            if (stop < 0) break;
            const prelude = text.slice(j, stop).trim();
            if (text[stop] === ";") {
                nodes.push({ kind: "at", name, prelude, body: null });
                i = stop + 1;
                continue;
            }
            const end = blockEnd(text, stop);
            if (end < 0) break;
            const body = text.slice(stop + 1, end);
            const nested = (name === "media" || name === "supports") && depth < MAX_NESTING;
            nodes.push({ kind: "at", name, prelude, body, ...(nested ? { children: parseBlocks(body, depth + 1) } : {}) });
            i = end + 1;
            continue;
        }
        const open = scanTo(text, i, "{;");
        if (open < 0) break;
        if (text[open] === ";") {
            i = open + 1;
            continue;
        }
        const end = blockEnd(text, open);
        if (end < 0) break;
        nodes.push({ kind: "rule", selector: text.slice(i, open).trim(), body: text.slice(open + 1, end) });
        i = end + 1;
    }
    return nodes;
}

function serialize(nodes: readonly Node[], href: string, ctx: Ctx, depth: number): string[] {
    const out: string[] = [];
    for (const node of nodes) {
        if (ctx.rules > MAX_CSS_RULES) throw new DesignedCssError(`a page has more than ${MAX_CSS_RULES} style rules`);
        if (node.kind === "rule") {
            const selector = cleanSelector(node.selector);
            // A rule nesting rules of its own is not read: its body would be split wrong.
            if (!selector || node.body.includes("{")) continue;
            const body = cleanDeclarations(node.body, href, ctx);
            if (!body) continue;
            ctx.rules++;
            out.push(`${selector}{${body}}`);
            continue;
        }
        if (!node.children || depth >= MAX_NESTING) continue; // every other at-rule: gone (closed list)
        const prelude = node.prelude;
        if (prelude.includes("\\") || prelude.toLowerCase().includes("url(") || prelude.length > 500) continue;
        const inner = serialize(node.children, href, ctx, depth + 1);
        if (inner.length === 0) continue;
        ctx.rules++;
        out.push(`@${node.name} ${prelude}{${inner.join("\n")}}`);
    }
    return out;
}

/** A selector the page may use, its `html`, `:root` and `body` made the page's own — or null. */
function cleanSelector(raw: string): string | null {
    const selector = raw.replace(/\s+/g, " ").trim();
    if (!selector || selector.length > 2000 || selector.includes("\\") || selector.includes("{") || selector.includes("@")) return null;
    const lower = selector.toLowerCase();
    // `:scope` and `&` at the top of a shadow tree's sheet would match its host, as `:host` does (review S2).
    if (lower.includes(":host") || lower.includes("::slotted") || lower.includes("::part") || lower.includes(":scope") || lower.includes("&") || lower.includes("url(")) return null;
    let out = "";
    let i = 0;
    while (i < selector.length) {
        const ch = selector[i];
        if (ch === '"' || ch === "'") {
            const end = stringEnd(selector, i);
            out += selector.slice(i, end);
            i = end;
            continue;
        }
        if (ch === "[") {
            const end = selector.indexOf("]", i);
            if (end < 0) return null;
            out += selector.slice(i, end + 1);
            i = end + 1;
            continue;
        }
        if (/[a-zA-Z:]/.test(ch) && !identBefore(selector, i)) {
            let j = i + (ch === ":" ? 1 : 0);
            while (j < selector.length && /[\w-]/.test(selector[j])) j++;
            const word = selector.slice(i, j).toLowerCase();
            if (word === "html" || word === ":root") {
                out += "[data-zf-html]";
                i = j;
                continue;
            }
            if (word === "body") {
                out += "[data-zf-body]";
                i = j;
                continue;
            }
            out += selector.slice(i, j);
            i = j;
            continue;
        }
        out += ch;
        i++;
    }
    return out;
}

/** Whether the character before `i` continues a name (`.html-x`, `#body`, `a:root`), so `i` starts none. */
function identBefore(text: string, i: number): boolean {
    if (i === 0) return false;
    const prev = text[i - 1];
    return /[\w.#-]/.test(prev) || (prev === ":" && text[i] !== ":");
}

/** A declaration block, cleaned: what the page may keep of it, or "" when nothing is left. */
function cleanDeclarations(body: string, href: string, ctx: Ctx): string {
    const out: string[] = [];
    let at = 0;
    while (at <= body.length) {
        const end = scanTo(body, at, ";");
        const piece = body.slice(at, end < 0 ? body.length : end);
        at = end < 0 ? body.length + 1 : end + 1;
        const colon = piece.indexOf(":");
        if (colon < 0) continue;
        const property = piece.slice(0, colon).trim().toLowerCase();
        let value = piece.slice(colon + 1).trim();
        let important = "";
        const bang = value.toLowerCase().lastIndexOf("!important");
        if (bang >= 0 && value.slice(bang + "!important".length).trim() === "") {
            value = value.slice(0, bang).trim();
            important = " !important";
        }
        const kept = cleanDeclaration(property, value, href, ctx);
        if (kept !== null) out.push(`${property}:${kept}${important}`);
    }
    return out.join(";");
}

function unprefixed(name: string): string {
    for (const prefix of ["-webkit-", "-moz-", "-ms-", "-o-", "-epub-"]) if (name.startsWith(prefix)) return name.slice(prefix.length);
    return name;
}

/** One declaration's value, cleaned — or null to drop it. */
function cleanDeclaration(property: string, value: string, href: string, ctx: Ctx): string | null {
    const custom = property.startsWith("--");
    if (custom ? !/^--[\w-]{1,100}$/.test(property) : !/^-?[a-z][a-z0-9-]{0,60}$/.test(property)) return null;
    if (!value || value.length > 4000 || value.includes("\\") || value.includes("{") || value.includes("}")) return null;
    const plain = unprefixed(property);
    if (!custom && (plain.startsWith("animation") || plain.startsWith("transition") || DROPPED.has(plain) || plain === "user-select")) return null;
    const lower = value.toLowerCase();
    // A custom property can carry a URL into any declaration that reads it: none may hold one.
    if (custom && lower.includes("url(")) return null;
    // A `url(` written inside a string is not a URL, and rewriting it would change where the strings
    // end (review S1): a value that holds one is dropped.
    const calls = functionNames(lower);
    if (calls.filter((name) => name === "url").length !== lower.split("url(").length - 1) return null;
    if (!closedList(calls)) return null;
    let kept = value;
    if (lower.includes("url(")) {
        const bound = placeUrls(value, href, ctx);
        if (bound === null) return null;
        // Checked again as it now reads: the strings must still end where they did.
        if (!closedList(functionNames(bound.toLowerCase()))) return null;
        kept = bound;
    }
    // A box stays in its page: `fixed` and `sticky` become `absolute`; anything else that is not a plain
    // position (a `var()`, `-webkit-sticky`) is dropped (review S3).
    if (plain === "position") {
        if (lower === "fixed" || lower === "sticky" || lower === "-webkit-sticky") return "absolute";
        return POSITIONS.has(lower) ? lower : null;
    }
    if (plain === "font-family" || plain === "font") kept = renameFamilies(kept, ctx.book, plain === "font");
    return kept;
}

/** Every function on the closed list: a plain parenthesis (in `calc`) names none; `local`/`format` are a font's. */
function closedList(names: readonly string[]): boolean {
    return names.every((name) => name === "" || (FUNCTIONS.has(unprefixed(name)) && name !== "local" && name !== "format"));
}

/** Every function named in a value (outside its strings), lower-cased. */
function functionNames(lower: string): string[] {
    const names: string[] = [];
    let i = 0;
    while (i < lower.length) {
        const ch = lower[i];
        if (ch === '"' || ch === "'") {
            i = stringEnd(lower, i);
            continue;
        }
        if (ch === "(") {
            let j = i;
            while (j > 0 && /[a-z0-9-]/.test(lower[j - 1])) j--;
            names.push(lower.slice(j, i));
        }
        i++;
    }
    return names;
}

/** `url(…)`'s argument starting at `from` (just past the paren): its value and where it ends. */
function urlArgument(text: string, from: number): { value: string; end: number } | null {
    let i = from;
    while (i < text.length && /\s/.test(text[i])) i++;
    if (text[i] === '"' || text[i] === "'") {
        const end = stringEnd(text, i);
        const value = text.slice(i + 1, end - 1);
        let j = end;
        while (j < text.length && /\s/.test(text[j])) j++;
        return text[j] === ")" ? { value, end: j + 1 } : null;
    }
    const close = text.indexOf(")", i);
    if (close < 0) return null;
    const value = text.slice(i, close).trim();
    if (/["'(\s]/.test(value)) return null;
    return { value, end: close + 1 };
}

/** Every `url()` in a value made a placeholder for a file inside the book — or null when one leaves it. */
function placeUrls(value: string, href: string, ctx: Ctx): string | null {
    let out = "";
    let at = 0;
    const lower = value.toLowerCase();
    for (let i = lower.indexOf("url(", at); i >= 0; i = lower.indexOf("url(", at)) {
        const arg = urlArgument(value, i + 4);
        if (!arg) return null;
        const target = arg.value.trim();
        if (!target || target.startsWith("#") || leavesTheBook(target)) return null;
        const path = resolveHref(href, target);
        let n = ctx.assetIndex.get(path);
        if (n === undefined) {
            n = ctx.assets.length;
            if (n >= MAX_CSS_ASSETS) throw new DesignedCssError(`a page's styles name more than ${MAX_CSS_ASSETS} files`);
            ctx.assets.push(path);
            ctx.assetIndex.set(path, n);
        }
        out += value.slice(at, i) + `url("zf-asset:${n}")`;
        at = arg.end;
    }
    return out + value.slice(at);
}

/** A family name as written: unquoted, whitespace folded, lower-cased — or null when it is not one. */
function familyKey(raw: string): string | null {
    let name = raw.trim();
    if ((name.startsWith('"') && name.endsWith('"')) || (name.startsWith("'") && name.endsWith("'"))) name = name.slice(1, -1);
    name = name.replace(/\s+/g, " ").trim().toLowerCase();
    return name && name.length <= 100 && !/["'(),;\\]/.test(name) ? name : null;
}

/** Every family the book declares, renamed to ours; the `font` shorthand's family list too. */
function renameFamilies(value: string, book: DesignedCssBook, shorthand: boolean): string {
    if (book.families.size === 0) return value;
    const parts = splitTop(value, ",");
    return parts
        .map((part, i) => {
            const whole = familyKey(part);
            const ours = whole ? book.families.get(whole) : undefined;
            if (ours) return `"${ours}"`;
            if (!shorthand || i > 0) return part;
            // `font: italic 12px "Comic"`: the family is what follows the size.
            for (const [family, name] of book.families) {
                const trimmed = part.trimEnd();
                for (const written of [`"${family}"`, `'${family}'`, family]) {
                    if (trimmed.toLowerCase().endsWith(written) && /\s/.test(trimmed[trimmed.length - written.length - 1] ?? "")) {
                        return `${trimmed.slice(0, trimmed.length - written.length)}"${name}"`;
                    }
                }
            }
            return part;
        })
        .join(",");
}

function splitTop(text: string, separator: string): string[] {
    const parts: string[] = [];
    let at = 0;
    for (;;) {
        const i = scanTo(text, at, separator);
        if (i < 0) {
            parts.push(text.slice(at));
            return parts;
        }
        parts.push(text.slice(at, i));
        at = i + 1;
    }
}

const WEIGHT = /^(normal|bold|bolder|lighter|[1-9]00)( [1-9]00)?$/;
const STYLE = /^(normal|italic|oblique)$/;

/**
 * The book's own fonts (FR-2): each `@font-face` whose `src` names a file inside the book becomes a
 * face to load from the archive, under our name — so a book's "Inter" can never replace the app's.
 * One that only names a file outside the book is no font at all, and its family is not renamed.
 */
function collectFonts(nodes: readonly Node[], href: string, book: DesignedCssBook): void {
    for (const node of nodes) {
        if (node.kind !== "at") continue;
        if (node.children) collectFonts(node.children, href, book);
        if (node.name !== "font-face" || !node.body || node.body.includes("\\")) continue;
        const decls = new Map<string, string>();
        for (const piece of splitTop(node.body, ";")) {
            const colon = piece.indexOf(":");
            if (colon > 0) decls.set(piece.slice(0, colon).trim().toLowerCase(), piece.slice(colon + 1).trim());
        }
        const family = familyKey(decls.get("font-family") ?? "");
        const path = fontFile(decls.get("src") ?? "", href);
        if (!family || !path) continue;
        let name = book.families.get(family);
        if (!name) {
            name = `zf-fxl-${book.key}-${book.families.size}`;
            book.families.set(family, name);
        }
        const weight = (decls.get("font-weight") ?? "").toLowerCase();
        const style = (decls.get("font-style") ?? "").toLowerCase();
        const face: DesignedFont = { family: name, path, ...(WEIGHT.test(weight) ? { weight } : {}), ...(STYLE.test(style) ? { style } : {}) };
        if (!book.fonts.some((f) => f.family === face.family && f.path === face.path && f.weight === face.weight && f.style === face.style)) book.fonts.push(face);
    }
}

/** The first `url()` of a `src` that names a file inside the book. `local()` is never read. */
function fontFile(src: string, href: string): string | null {
    const lower = src.toLowerCase();
    for (let i = lower.indexOf("url("); i >= 0; i = lower.indexOf("url(", i + 4)) {
        const arg = urlArgument(src, i + 4);
        if (!arg) return null;
        const target = arg.value.trim();
        if (target && !target.startsWith("#") && !leavesTheBook(target)) return resolveHref(href, target);
    }
    return null;
}
