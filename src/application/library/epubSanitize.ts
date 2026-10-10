import { fragmentOf, leavesTheBook, resolveHref } from "./epubPackage";
import {
    MATH_DROP,
    MATH_ELEMENTS,
    MATH_TOKENS,
    MAX_ALTTEXT,
    MAX_USE,
    SVG_TEXT,
    localRef,
    mathAttribute,
    promoteStyle,
    scopedId,
    svgAttributeName,
    svgDropped,
    svgElementName,
    svgValue,
    type SvgValue,
} from "./epubForeign";

/**
 * **A book's chapter, rebuilt node by node** (#682, epic #675, L4) — pure.
 *
 * An EPUB chapter is XHTML someone else wrote, and it is drawn inside your vault's window. It is
 * never handed to `innerHTML`: it is parsed (by the platform, as data) and **rebuilt** here, one
 * allowed element at a time, through a builder the caller supplies. What is not on the list below
 * does not exist on the page:
 *
 * - **No script, ever** — no `<script>`, no `on*` attribute, no `javascript:` (or any other scheme),
 *   no `<iframe>`, `<object>`, `<embed>`, forms, `<meta>`, `<link>`, `<base>` or `<style>`.
 * - **No look of its own** — no `style`, no `class`: the book reads in your theme (§XV).
 * - **No network** (L1) — an image is only ever a file inside the book, handed back as its path for
 *   the caller to read from the archive; a link either stays in the book or is not a link.
 * - **Only SVG and MathML that draw** (#770) — presentation MathML and inline SVG are rebuilt from
 *   their own closed lists (`epubForeign`): no script, `foreignObject`, `style`, animation, or any
 *   reference that leaves the drawing. A cover drawn as `<svg><image/></svg>` is still a plain image.
 *
 * An element that is not allowed but is harmless (`<nav>`, `<center>`, an unknown tag) gives up its
 * tag and keeps its text; one that is dangerous goes with everything inside it.
 */

/** The little of a parsed node the sanitizer reads. */
export interface SourceNode {
    nodeType: number;
    nodeName: string;
    localName?: string | null;
    namespaceURI?: string | null;
    data?: string;
    textContent?: string | null;
    childNodes: ArrayLike<SourceNode>;
    attributes?: ArrayLike<{ name: string; value: string }>;
    getAttribute?(name: string): string | null;
}

/** How the clean chapter is built — `createEl` in the app, a recorder in the tests. */
export interface ChapterBuilder<E> {
    /** `ns` is set for an element of an equation (`math`) or a drawing (`svg`); absent for HTML. */
    element(parent: E, tag: string, attrs: Record<string, string>, ns?: "svg" | "math"): E;
    text(parent: E, text: string): void;
}

export interface SanitizeResult {
    /** The archive paths of the images the chapter shows, in order (for the caller to read). */
    images: string[];
    /** Elements kept, for the budget and the tests. */
    elements: number;
    /** A designed page's `<style>` text in its body, collected and never built (#771). */
    styles?: string[];
    /** A designed page's `style` attributes, in order: the n-th element carries `data-zf-s="n"` (#771). */
    inline?: string[];
}

/**
 * How a chapter is rebuilt (#771). **Flow** (#682): in your type, nothing of the book's look kept.
 * **Designed** — a fixed-layout page: everything the flow keeps, plus its `class` and `id` (safe in the
 * page's own shadow root), its `width` and `height`, and its styles *collected* — `<style>` text and
 * every `style` attribute, moved to a rule the caller cleans. No `style` attribute is ever set.
 */
export type SanitizePolicy = "flow" | "designed";

/** Elements kept as they are. */
const KEEP = new Set([
    "p", "div", "span", "section", "article", "aside", "header", "footer", "main", "figure", "figcaption",
    "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code", "em", "strong", "b", "i", "u", "s",
    "small", "sub", "sup", "br", "hr", "ul", "ol", "li", "dl", "dt", "dd", "table", "thead", "tbody",
    "tfoot", "tr", "th", "td", "caption", "img", "a", "abbr", "cite", "q", "del", "ins", "time", "ruby",
    "rt", "rp", "kbd", "samp", "var", "dfn", "bdi", "bdo", "wbr",
]);

/** Elements kept under another name: their meaning, without what they would do here. */
const RENAME: Record<string, string> = { nav: "div", center: "div", big: "span", mark: "span", tt: "code", strike: "s" };

/** Elements dropped with everything in them. */
const DROP = new Set([
    "script", "style", "iframe", "frame", "frameset", "object", "embed", "applet", "form", "input",
    "button", "textarea", "select", "option", "optgroup", "label", "fieldset", "legend", "link", "meta",
    "base", "audio", "video", "source", "track", "canvas", "template", "noscript", "head", "title",
    "dialog", "portal", "slot", "picture", "map", "area", "param",
]);

/** Attributes kept, and what a value must look like to be kept. */
const ATTRS: Record<string, RegExp> = {
    title: /^[\s\S]{0,300}$/,
    lang: /^[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*$/,
    dir: /^(ltr|rtl|auto)$/,
    colspan: /^\d{1,3}$/,
    rowspan: /^\d{1,3}$/,
    start: /^-?\d{1,6}$/,
    value: /^-?\d{1,6}$/,
    reversed: /^[\s\S]{0,20}$/,
    alt: /^[\s\S]{0,500}$/,
};

/** Bounds, so a hostile chapter cannot make the page hang. */
const MAX_DEPTH = 64;
const MAX_ELEMENTS = 60_000;

const ELEMENT = 1;
const TEXT = 3;
const CDATA = 4;

function nameOf(node: SourceNode): string {
    const raw = node.localName ?? node.nodeName;
    const colon = raw.indexOf(":");
    return (colon >= 0 ? raw.slice(colon + 1) : raw).toLowerCase();
}

function attributesOf(node: SourceNode): { name: string; value: string }[] {
    const out: { name: string; value: string }[] = [];
    const list = node.attributes;
    if (!list) return out;
    for (let i = 0; i < list.length; i++) out.push({ name: list[i].name, value: list[i].value });
    return out;
}

function attr(node: SourceNode, name: string): string {
    return (node.getAttribute?.(name) ?? attributesOf(node).find((a) => a.name === name)?.value ?? "").trim();
}

/** An image inside the book, as its path in the archive — or nothing, for one that would leave it. */
function imageIn(chapterHref: string, src: string): string | null {
    if (!src || leavesTheBook(src)) return null;
    return resolveHref(chapterHref, src);
}

/** An id a link (or a drawing's own reference) can name. */
const ID = /^[\w.:-]{1,120}$/;

/** The HTML an equation may hold (a `span` in an `mi`): it gives up its tag and keeps its text. */
const HTML_NAMES: ReadonlySet<string> = new Set([...KEEP, ...Object.keys(RENAME)]);

/** What the foreign walkers share with the chapter's: the builder, the budget, where the chapter is. */
interface Foreign<E> {
    builder: ChapterBuilder<E>;
    result: SanitizeResult;
    chapterHref: string;
    /** `use` kept so far in the chapter (at most `MAX_USE`). */
    uses: number;
}

/** One drawing being rebuilt: its number (for scoped ids) and the ids it declares. */
interface Drawing {
    draw: number;
    ids: Map<string, SourceNode>;
    holdsUse: Map<SourceNode, boolean>;
}

function elementChildren(node: SourceNode): SourceNode[] {
    const out: SourceNode[] = [];
    for (let i = 0; i < node.childNodes.length; i++) if (node.childNodes[i].nodeType === ELEMENT) out.push(node.childNodes[i]);
    return out;
}

function rawAttr(node: SourceNode, name: string): string | null {
    return node.getAttribute?.(name) ?? attributesOf(node).find((a) => a.name === name)?.value ?? null;
}

function hrefOf(node: SourceNode): string {
    return attr(node, "href") || attr(node, "xlink:href");
}

/** A link inside the book, as the place it names (`path#fragment`). */
function placeIn(chapterHref: string, href: string): string {
    const fragment = fragmentOf(href);
    const inside = href.startsWith("#") ? chapterHref : resolveHref(chapterHref, href);
    return fragment ? `${inside}#${fragment}` : inside;
}

// ── MathML ───────────────────────────────────────────────────────────────

function mathAttrs(node: SourceNode): Record<string, string> {
    const out: Record<string, string> = {};
    for (const { name, value } of attributesOf(node)) {
        const kept = mathAttribute(name, value);
        if (kept) out[kept[0]] = kept[1];
        const key = name.toLowerCase();
        if ((key === "id" || key === "xml:id") && ID.test(value)) out["data-zf-id"] = value;
    }
    return out;
}

/** The child of `maction` it shows: its `selection`-th (1 by default). */
function selected(node: SourceNode): SourceNode | undefined {
    const kids = elementChildren(node);
    const n = parseInt(attr(node, "selection"), 10);
    return kids[(n >= 1 ? n : 1) - 1] ?? kids[0];
}

/** Whether an element of an equation draws anything once cleaned (FR-3). */
function mathDrawsOne(node: SourceNode, depth: number): boolean {
    if (depth >= MAX_DEPTH) return false;
    const name = nameOf(node);
    if (MATH_ELEMENTS.has(name) && name !== "math") return true;
    if (name === "mfenced" || name === "mlabeledtr") return true;
    if (name === "semantics") {
        const first = elementChildren(node)[0];
        return first ? mathDrawsOne(first, depth + 1) : false;
    }
    if (name === "maction") {
        const one = selected(node);
        return one ? mathDrawsOne(one, depth + 1) : false;
    }
    if (DROP.has(name) || MATH_DROP.has(name)) return false;
    if (name === "math" || HTML_NAMES.has(name)) return elementChildren(node).some((child) => mathDrawsOne(child, depth + 1));
    return false;
}

/** An equation's words, for one that draws nothing: never its annotations' TeX. */
function mathText(node: SourceNode, depth = 0): string {
    if (depth >= MAX_DEPTH) return "";
    let out = "";
    for (let i = 0; i < node.childNodes.length && out.length < 2000; i++) {
        const child = node.childNodes[i];
        if (child.nodeType === TEXT || child.nodeType === CDATA) out += child.data ?? child.textContent ?? "";
        else if (child.nodeType === ELEMENT) {
            const name = nameOf(child);
            if (!MATH_DROP.has(name) && !DROP.has(name) && name !== "svg") out += mathText(child, depth + 1);
        }
    }
    return out.slice(0, 2000);
}

function sanitizeEquation<E>(math: SourceNode, into: E, f: Foreign<E>, depth: number): void {
    if (f.result.elements >= MAX_ELEMENTS) return;
    if (!elementChildren(math).some((child) => mathDrawsOne(child, depth + 1))) {
        // Nothing the platform could draw (Content MathML only): its words, as plain text (FR-3).
        const text = attr(math, "alttext").slice(0, MAX_ALTTEXT) || mathText(math).trim();
        if (text) f.builder.text(into, text);
        return;
    }
    f.result.elements++;
    mathWalk(math, f.builder.element(into, "math", mathAttrs(math), "math"), f, depth + 1, false);
}

function mathWalk<E>(node: SourceNode, into: E, f: Foreign<E>, depth: number, inToken: boolean): void {
    for (let i = 0; i < node.childNodes.length; i++) {
        if (f.result.elements >= MAX_ELEMENTS) return;
        const child = node.childNodes[i];
        if (child.nodeType === TEXT || child.nodeType === CDATA) {
            const text = child.data ?? child.textContent ?? "";
            // Only a token's text is drawn; the whitespace between elements is not the equation's.
            if (text && (inToken || text.trim())) f.builder.text(into, text);
        } else if (child.nodeType === ELEMENT) mathOne(child, into, f, depth, inToken);
    }
}

function mathOne<E>(node: SourceNode, into: E, f: Foreign<E>, depth: number, inToken: boolean): void {
    if (depth >= MAX_DEPTH || f.result.elements >= MAX_ELEMENTS) return;
    const name = nameOf(node);
    if (MATH_DROP.has(name) || name === "svg" || DROP.has(name)) return;
    const make = (tag: string, attrs: Record<string, string>, under: E = into): E => {
        f.result.elements++;
        return f.builder.element(under, tag, attrs, "math");
    };
    if (name === "semantics") {
        const first = elementChildren(node)[0];
        if (first) mathOne(first, into, f, depth + 1, inToken);
        return;
    }
    if (name === "maction") {
        const one = selected(node);
        if (one) mathOne(one, into, f, depth + 1, inToken);
        return;
    }
    if (name === "mfenced") {
        // MathML Core does not draw mfenced: a row between its fences, its separators drawn.
        const row = make("mrow", mathAttrs(node));
        const fence = (text: string) => {
            if (!text || f.result.elements >= MAX_ELEMENTS) return;
            f.builder.text(make("mo", {}, row), text);
        };
        const open = (rawAttr(node, "open") ?? "(").trim().slice(0, 4);
        const close = (rawAttr(node, "close") ?? ")").trim().slice(0, 4);
        const separators = Array.from((rawAttr(node, "separators") ?? ",").replace(/\s/g, "")).slice(0, 32);
        const kids = elementChildren(node);
        fence(open);
        kids.forEach((kid, i) => {
            mathOne(kid, row, f, depth + 1, inToken);
            if (i < kids.length - 1 && separators.length > 0) fence(separators[Math.min(i, separators.length - 1)]);
        });
        fence(close);
        return;
    }
    if (name === "mlabeledtr") {
        // A numbered row: the row, without its label cell.
        const row = make("mtr", mathAttrs(node));
        for (const kid of elementChildren(node).slice(1)) mathOne(kid, row, f, depth + 1, inToken);
        return;
    }
    if (MATH_ELEMENTS.has(name) && name !== "math") {
        mathWalk(node, make(name, mathAttrs(node)), f, depth + 1, inToken || MATH_TOKENS.has(name));
        return;
    }
    // HTML inside an equation (or an equation inside one): its text, without its element.
    if (name === "math" || HTML_NAMES.has(name)) mathWalk(node, into, f, depth + 1, inToken);
    // Anything else — Content MathML, an unknown element — goes with what is inside it.
}

// ── SVG ──────────────────────────────────────────────────────────────────

/** Drawings rebuilt so far: each one's ids are scoped by its number, never reused (a chapter turn). */
let drawings = 0;

/**
 * The pictures of a cover drawn as SVG (FR-7): when the only things it draws are `image` elements
 * (beside `title`, `desc`, `defs` and what is dropped anyway), each is handed to `each` and the
 * answer is `true`. Anything else that draws makes it a drawing.
 */
function coverPictures(svg: SourceNode, each: (picture: SourceNode) => void): boolean {
    const pictures: SourceNode[] = [];
    let draws = false;
    const visit = (node: SourceNode, depth: number) => {
        if (depth > 8) return;
        for (const child of elementChildren(node)) {
            const name = nameOf(child);
            if (svgDropped(name) || name === "title" || name === "desc" || name === "defs") continue;
            if (name === "image") pictures.push(child);
            else if (name === "g" || name === "a" || name === "switch") visit(child, depth + 1);
            else draws = true;
        }
    };
    visit(svg, 0);
    if (draws || pictures.length === 0) return false;
    pictures.forEach(each);
    return true;
}

/** Every id a drawing declares on an element it keeps — the only things its references may name. */
function drawingIds(svg: SourceNode): Map<string, SourceNode> {
    const ids = new Map<string, SourceNode>();
    const visit = (node: SourceNode, depth: number) => {
        const id = attr(node, "id") || attr(node, "xml:id");
        if (id && ID.test(id) && !ids.has(id)) ids.set(id, node);
        if (depth >= MAX_DEPTH) return;
        for (const child of elementChildren(node)) if (svgElementName(nameOf(child))) visit(child, depth + 1);
    };
    visit(svg, 0);
    return ids;
}

/** Whether a `use`'s target is, or holds, a `use`: nested `use` could expand without end. */
function holdsUse(node: SourceNode, d: Drawing, depth = 0): boolean {
    const known = d.holdsUse.get(node);
    if (known !== undefined) return known;
    const answer =
        nameOf(node) === "use" ||
        (depth < MAX_DEPTH && elementChildren(node).some((child) => svgElementName(nameOf(child)) !== null && holdsUse(child, d, depth + 1)));
    d.holdsUse.set(node, answer);
    return answer;
}

/** A kept value, its reference into the drawing scoped — or `null` when it names nothing inside it. */
function resolved(kept: SvgValue, d: Drawing): string | null {
    if (!kept.ref) return kept.value;
    if (d.ids.has(kept.ref)) return `url(#${scopedId(d.draw, kept.ref)})${kept.fallback ? ` ${kept.fallback}` : ""}`;
    return kept.fallback ?? kept.missing ?? null;
}

function svgAttrs(node: SourceNode, d: Drawing): Record<string, string> {
    const out: Record<string, string> = {};
    let style = "";
    for (const { name, value } of attributesOf(node)) {
        const lower = name.toLowerCase();
        if (lower === "style") {
            style = value;
            continue;
        }
        if (lower === "id" || lower === "xml:id") {
            if (d.ids.get(value) === node) {
                out.id = scopedId(d.draw, value);
                out["data-zf-id"] = value;
            }
            continue;
        }
        const canonical = svgAttributeName(name);
        const kept = canonical ? svgValue(canonical, value) : null;
        const final = kept ? resolved(kept, d) : null;
        if (canonical && final !== null) out[canonical] = final;
    }
    // Inkscape and Illustrator write a diagram's colours in `style`: promoted, never copied.
    for (const [prop, kept] of Object.entries(promoteStyle(style))) {
        const final = resolved(kept, d);
        if (final !== null) out[prop] = final;
    }
    return out;
}

/** Elements whose `href` may only name something inside the same drawing. */
const REFERRING = new Set(["textPath", "linearGradient", "radialGradient", "pattern"]);

function sanitizeDrawing<E>(svg: SourceNode, into: E, f: Foreign<E>, depth: number): void {
    if (depth >= MAX_DEPTH || f.result.elements >= MAX_ELEMENTS) return;
    const d: Drawing = { draw: ++drawings, ids: drawingIds(svg), holdsUse: new Map() };
    f.result.elements++;
    // A fixed flag, never the book's value: what tells a book's drawing from the app's icons.
    const root = f.builder.element(into, "svg", { ...svgAttrs(svg, d), "data-zf-drawing": "true" }, "svg");
    svgWalk(svg, root, f, d, depth + 1, false);
}

function svgWalk<E>(node: SourceNode, into: E, f: Foreign<E>, d: Drawing, depth: number, inText: boolean): void {
    for (let i = 0; i < node.childNodes.length; i++) {
        if (f.result.elements >= MAX_ELEMENTS) return;
        const child = node.childNodes[i];
        if (child.nodeType === TEXT || child.nodeType === CDATA) {
            // Only a label's words are drawn: text loose between shapes is not the drawing's.
            const text = child.data ?? child.textContent ?? "";
            if (inText && text) f.builder.text(into, text);
        } else if (child.nodeType === ELEMENT) svgOne(child, into, f, d, depth, inText);
    }
}

function svgOne<E>(node: SourceNode, into: E, f: Foreign<E>, d: Drawing, depth: number, inText: boolean): void {
    if (depth >= MAX_DEPTH || f.result.elements >= MAX_ELEMENTS) return;
    let tag = svgElementName(nameOf(node));
    if (!tag) return; // HTML, script, foreignObject, animation, a filter: gone with what is inside
    const attrs = svgAttrs(node, d);
    if (tag === "use") {
        const ref = localRef(hrefOf(node));
        const target = ref ? d.ids.get(ref) : undefined;
        if (!ref || !target || holdsUse(target, d) || f.uses >= MAX_USE) return;
        f.uses++;
        attrs.href = `#${scopedId(d.draw, ref)}`;
    } else if (tag === "image") {
        // A picture only from inside the book, read from the archive by the caller (L1).
        const path = imageIn(f.chapterHref, hrefOf(node));
        if (!path) return;
        attrs["data-zf-src"] = path;
        f.result.images.push(path);
    } else if (tag === "a") {
        const href = hrefOf(node);
        if (href && !leavesTheBook(href)) attrs["data-zf-href"] = placeIn(f.chapterHref, href);
        else {
            // A link that leaves the book is its text and nothing else.
            tag = inText ? "tspan" : "g";
            attrs["data-zf-outlink"] = "true";
        }
    } else if (REFERRING.has(tag)) {
        const ref = localRef(hrefOf(node));
        if (ref && d.ids.has(ref)) attrs.href = `#${scopedId(d.draw, ref)}`;
    }
    f.result.elements++;
    svgWalk(node, f.builder.element(into, tag, attrs, "svg"), f, d, depth + 1, inText || SVG_TEXT.has(tag));
}

/**
 * One inline drawing, rebuilt with the chapter's rules (#770) — for a caller that meets an `<svg>`
 * outside a chapter's flow (the fixed-layout pages of #771). Its pictures are listed in the result.
 */
export function sanitizeSvg<E>(svg: SourceNode, parent: E, builder: ChapterBuilder<E>, chapterHref: string): SanitizeResult {
    const result: SanitizeResult = { images: [], elements: 0 };
    sanitizeDrawing(svg, parent, { builder, result, chapterHref, uses: 0 }, 0);
    return result;
}

/**
 * Rebuild `root`'s children under `parent`. `chapterHref` is the chapter's path in the archive, so
 * relative images and links resolve inside the book.
 */
export function sanitizeChapter<E>(
    root: SourceNode,
    parent: E,
    builder: ChapterBuilder<E>,
    chapterHref: string,
    options: { policy?: SanitizePolicy; inline?: string[] } = {}
): SanitizeResult {
    const designed = options.policy === "designed";
    const result: SanitizeResult = { images: [], elements: 0, ...(designed ? { styles: [], inline: options.inline ?? [] } : {}) };

    const image = (into: E, path: string, alt: string, own: Record<string, string> = {}) => {
        result.images.push(path);
        result.elements++;
        builder.element(into, "img", { ...own, "data-zf-src": path, alt, ...(designed ? {} : { loading: "lazy" }) });
    };

    const foreign: Foreign<E> = { builder, result, chapterHref, uses: 0 };

    const walk = (node: SourceNode, into: E, depth: number) => {
        for (let i = 0; i < node.childNodes.length; i++) {
            if (result.elements >= MAX_ELEMENTS) return;
            const child = node.childNodes[i];
            if (child.nodeType === TEXT || child.nodeType === CDATA) {
                const text = child.data ?? child.textContent ?? "";
                if (text) builder.text(into, text);
                continue;
            }
            if (child.nodeType !== ELEMENT) continue; // comments, processing instructions
            const name = nameOf(child);
            if (designed && name === "style") {
                // Collected for the cleaner, never built (#771).
                result.styles?.push((child.textContent ?? "").slice(0, 512 * 1024));
                continue;
            }
            if (DROP.has(name)) continue;
            if (depth >= MAX_DEPTH) continue;
            if (name === "svg") {
                // A designed page keeps its drawing whole: its viewBox is where its pictures sit.
                const cover = !designed && coverPictures(child, (picture) => {
                    const path = imageIn(chapterHref, hrefOf(picture));
                    if (path) image(into, path, "");
                });
                if (!cover) sanitizeDrawing(child, into, foreign, depth);
                continue;
            }
            if (name === "math") {
                sanitizeEquation(child, into, foreign, depth);
                continue;
            }
            if (name === "img") {
                const path = imageIn(chapterHref, attr(child, "src"));
                if (path) image(into, path, attr(child, "alt").slice(0, 500), designed ? designedAttributes(child, result.inline ?? []) : {});
                continue;
            }
            const tag = KEEP.has(name) ? name : RENAME[name];
            if (!tag) {
                // Harmless and unknown (a custom tag): its text, without its element.
                walk(child, into, depth + 1);
                continue;
            }
            const attrs: Record<string, string> = {};
            for (const { name: raw, value } of attributesOf(child)) {
                const key = raw.toLowerCase();
                const rule = ATTRS[key];
                if (rule && rule.test(value)) attrs[key] = value;
                // EPUB's XHTML often says a passage's language as `xml:lang` (#757): kept as `lang`,
                // which is what the page hyphenates by. A `lang` of its own wins.
                if (key === "xml:lang" && ATTRS.lang.test(value) && !attributesOf(child).some((a) => a.name.toLowerCase() === "lang")) attrs.lang = value;
                // An element a link can name, kept as data so it never collides with the app's ids.
                if ((key === "id" || key === "xml:id") && /^[\w.:-]{1,120}$/.test(value)) attrs["data-zf-id"] = value;
                // What marks a footnote (#718): EPUB 3 `epub:type` or ARIA `role`, read for its
                // meaning and kept only as a fixed flag — the book's own value is never copied.
                if (key === "epub:type" || key === "type" || key === "role") {
                    const kinds = value.toLowerCase().split(/\s+/);
                    if (kinds.some((kind) => kind === "noteref" || kind === "doc-noteref")) attrs["data-zf-noteref"] = "true";
                    else if (kinds.some((kind) => /^(doc-)?(footnote|endnote|rearnote|note)s?$/.test(kind))) attrs["data-zf-note"] = "true";
                }
            }
            let element = tag;
            if (tag === "a") {
                const href = attr(child, "href");
                if (href && !leavesTheBook(href)) attrs["data-zf-href"] = placeIn(chapterHref, href);
                else {
                    // A link that leaves the book is its text and nothing else (L1).
                    element = "span";
                    attrs["data-zf-outlink"] = "true";
                }
            }
            if (designed) Object.assign(attrs, designedAttributes(child, result.inline ?? []));
            result.elements++;
            walk(child, builder.element(into, element, attrs), depth + 1);
        }
    };

    walk(root, parent, 0);
    return result;
}

/** A class list of plain names, as a designed page's own CSS may name them. */
const CLASS = /^[\w\s-]{1,300}$/;
/** A size the designer wrote on the element: a number, in pixels or a share. */
const SIZE = /^\d{1,5}(\.\d{1,3})?(px|%)?$/;

/**
 * What a designed page keeps of an element of its own (#771): its `class` and `id` (the page's own
 * shadow root scopes both), its written `width` and `height`, and its `style` — collected for the
 * cleaner and marked `data-zf-s`, never set as an attribute.
 */
export function designedAttributes(node: SourceNode, inline: string[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const { name, value } of attributesOf(node)) {
        const key = name.toLowerCase();
        if (key === "class" && CLASS.test(value)) out.class = value.replace(/\s+/g, " ").trim();
        else if (key === "id" && ID.test(value)) out.id = value;
        else if ((key === "width" || key === "height") && SIZE.test(value.trim())) out[key] = value.trim();
        else if (key === "style" && value.trim() && inline.length < 20_000) {
            out["data-zf-s"] = String(inline.length);
            inline.push(value.slice(0, 4000));
        }
    }
    return out;
}

/**
 * The language a chapter declares for itself (#757 FR-6): its `<body>`'s `lang` / `xml:lang`, else its
 * `<html>`'s. Nothing when it declares none, or something that is not a language.
 */
export function chapterLanguage(root: SourceNode): string | undefined {
    const declared = (node: SourceNode): string | undefined => {
        const value = attr(node, "lang") || attr(node, "xml:lang");
        return value && ATTRS.lang.test(value) ? value : undefined;
    };
    const body = bodyOf(root);
    return (body !== root ? declared(body) : undefined) ?? declared(root);
}

/** The `<body>` of a parsed chapter, or the root when there is none. */
export function bodyOf(root: SourceNode): SourceNode {
    const find = (node: SourceNode, depth: number): SourceNode | null => {
        if (nameOf(node) === "body") return node;
        if (depth > 3) return null;
        for (let i = 0; i < node.childNodes.length; i++) {
            const child = node.childNodes[i];
            if (child.nodeType !== ELEMENT) continue;
            const found = find(child, depth + 1);
            if (found) return found;
        }
        return null;
    };
    return find(root, 0) ?? root;
}
