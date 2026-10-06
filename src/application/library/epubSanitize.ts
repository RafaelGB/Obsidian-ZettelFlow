import { fragmentOf, leavesTheBook, resolveHref } from "./epubPackage";

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
 * - **No SVG** — except the one thing a book uses it for, a cover drawn as `<svg><image/></svg>`,
 *   which becomes a plain image.
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
    element(parent: E, tag: string, attrs: Record<string, string>): E;
    text(parent: E, text: string): void;
}

export interface SanitizeResult {
    /** The archive paths of the images the chapter shows, in order (for the caller to read). */
    images: string[];
    /** Elements kept, for the budget and the tests. */
    elements: number;
}

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

/**
 * Rebuild `root`'s children under `parent`. `chapterHref` is the chapter's path in the archive, so
 * relative images and links resolve inside the book.
 */
export function sanitizeChapter<E>(root: SourceNode, parent: E, builder: ChapterBuilder<E>, chapterHref: string): SanitizeResult {
    const result: SanitizeResult = { images: [], elements: 0 };

    const image = (into: E, path: string, alt: string) => {
        result.images.push(path);
        result.elements++;
        builder.element(into, "img", { "data-zf-src": path, alt, loading: "lazy" });
    };

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
            if (DROP.has(name)) continue;
            if (depth >= MAX_DEPTH) continue;
            if (name === "svg") {
                // A cover drawn as SVG: its one picture, as a plain image. Anything else in it is gone.
                const pictures: SourceNode[] = [];
                const find = (n: SourceNode, d: number) => {
                    if (d > 8) return;
                    for (let j = 0; j < n.childNodes.length; j++) {
                        const c = n.childNodes[j];
                        if (c.nodeType !== ELEMENT) continue;
                        if (nameOf(c) === "image") pictures.push(c);
                        else find(c, d + 1);
                    }
                };
                find(child, 0);
                for (const picture of pictures) {
                    const path = imageIn(chapterHref, attr(picture, "xlink:href") || attr(picture, "href"));
                    if (path) image(into, path, "");
                }
                continue;
            }
            if (name === "img") {
                const path = imageIn(chapterHref, attr(child, "src"));
                if (path) image(into, path, attr(child, "alt").slice(0, 500));
                continue;
            }
            const tag = KEEP.has(name) ? name : RENAME[name];
            if (!tag) {
                // Harmless and unknown (`math`, a custom tag): its text, without its element.
                walk(child, into, depth + 1);
                continue;
            }
            const attrs: Record<string, string> = {};
            for (const { name: raw, value } of attributesOf(child)) {
                const key = raw.toLowerCase();
                const rule = ATTRS[key];
                if (rule && rule.test(value)) attrs[key] = value;
                // An element a link can name, kept as data so it never collides with the app's ids.
                if ((key === "id" || key === "xml:id") && /^[\w.:-]{1,120}$/.test(value)) attrs["data-zf-id"] = value;
            }
            let element = tag;
            if (tag === "a") {
                const href = attr(child, "href");
                if (href && !leavesTheBook(href)) {
                    const fragment = fragmentOf(href);
                    const inside = href.startsWith("#") ? chapterHref : resolveHref(chapterHref, href);
                    attrs["data-zf-href"] = fragment ? `${inside}#${fragment}` : inside;
                } else {
                    // A link that leaves the book is its text and nothing else (L1).
                    element = "span";
                    attrs["data-zf-outlink"] = "true";
                }
            }
            result.elements++;
            walk(child, builder.element(into, element, attrs), depth + 1);
        }
    };

    walk(root, parent, 0);
    return result;
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
