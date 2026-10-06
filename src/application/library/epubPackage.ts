/**
 * **An EPUB's package** (#680, #682, epic #675) — pure, over parsed XML.
 *
 * What a reader needs from a book before it shows a page: where its package file is
 * (`META-INF/container.xml`), what the package says — title, author, the files it is made of, the
 * **spine** that orders them and the **cover** — and the book's own table of contents, from the
 * EPUB 3 `nav` document or the EPUB 2 `toc.ncx`.
 *
 * Parsing is handed in (`DOMParser` in the app, a small parser in the tests), and only the few
 * members of a DOM node below are read, so nothing here touches a document.
 */

/** The little of a parsed XML node this module reads. */
export interface XmlNode {
    nodeType: number;
    /** The name without its namespace prefix: `title` for `dc:title`. */
    localName?: string | null;
    nodeName: string;
    textContent: string | null;
    childNodes: ArrayLike<XmlNode>;
    getAttribute?(name: string): string | null;
}

export type XmlParse = (text: string, type: "application/xml" | "application/xhtml+xml") => { documentElement: XmlNode | null };

export interface ManifestItem {
    id: string;
    /** Its path inside the archive, resolved and decoded. */
    href: string;
    mediaType: string;
    properties: string[];
}

export interface SpineItem {
    href: string;
    linear: boolean;
}

export interface EpubPackage {
    title?: string;
    author?: string;
    manifest: ManifestItem[];
    spine: SpineItem[];
    coverHref?: string;
    navHref?: string;
    ncxHref?: string;
}

export interface TocEntry {
    title: string;
    /** The file it points at, inside the archive. */
    href: string;
    /** The element it points at in that file, when it names one. */
    fragment?: string;
    depth: number;
}

const ELEMENT = 1;

function nameOf(node: XmlNode): string {
    const raw = node.localName ?? node.nodeName;
    const colon = raw.indexOf(":");
    return (colon >= 0 ? raw.slice(colon + 1) : raw).toLowerCase();
}

function attr(node: XmlNode, name: string): string {
    return node.getAttribute?.(name)?.trim() ?? "";
}

function children(node: XmlNode): XmlNode[] {
    const out: XmlNode[] = [];
    for (let i = 0; i < node.childNodes.length; i++) if (node.childNodes[i].nodeType === ELEMENT) out.push(node.childNodes[i]);
    return out;
}

/** Every element under `root` named `name`, in document order. */
export function elementsNamed(root: XmlNode, name: string): XmlNode[] {
    const out: XmlNode[] = [];
    const walk = (node: XmlNode) => {
        for (const child of children(node)) {
            if (nameOf(child) === name) out.push(child);
            walk(child);
        }
    };
    if (nameOf(root) === name) out.push(root);
    walk(root);
    return out;
}

function firstNamed(root: XmlNode, name: string): XmlNode | undefined {
    return elementsNamed(root, name)[0];
}

function clean(text: string | null | undefined): string {
    return (text ?? "").replace(/\s+/g, " ").trim();
}

/** A URL inside the book, made a path inside the archive: relative to `base`, dots folded, decoded. */
export function resolveHref(base: string, href: string): string {
    const [path] = href.split(/[?#]/);
    if (!path) return base;
    const dir = base.includes("/") ? base.slice(0, base.lastIndexOf("/") + 1) : "";
    const parts = (path.startsWith("/") ? path.slice(1) : dir + path).split("/");
    const out: string[] = [];
    for (const part of parts) {
        if (part === "" || part === ".") continue;
        if (part === "..") out.pop();
        else out.push(part);
    }
    const joined = out.join("/");
    try {
        return decodeURIComponent(joined);
    } catch {
        return joined;
    }
}

/** The fragment of a URL inside the book (`chapter.xhtml#note-3` → `note-3`). */
export function fragmentOf(href: string): string | undefined {
    const at = href.indexOf("#");
    return at >= 0 && at < href.length - 1 ? href.slice(at + 1) : undefined;
}

/** Whether a URL leaves the book: a scheme of its own (`https:`, `mailto:`, `javascript:`…). */
export function leavesTheBook(href: string): boolean {
    return /^[a-z][a-z0-9+.-]*:/i.test(href.trim()) || href.trim().startsWith("//");
}

/** Where the package file is, from `META-INF/container.xml`. */
export function packagePath(containerXml: string, parse: XmlParse): string | null {
    const root = parse(containerXml, "application/xml").documentElement;
    if (!root) return null;
    const rootfile = elementsNamed(root, "rootfile").find((node) => attr(node, "full-path"));
    return rootfile ? resolveHref("", attr(rootfile, "full-path")) : null;
}

/** What the package file says. Never throws; a package it cannot read is an empty book. */
export function parsePackage(opfXml: string, opfPath: string, parse: XmlParse): EpubPackage {
    const root = parse(opfXml, "application/xml").documentElement;
    const empty: EpubPackage = { manifest: [], spine: [] };
    if (!root) return empty;

    const metadata = firstNamed(root, "metadata");
    const title = metadata ? clean(firstNamed(metadata, "title")?.textContent) : "";
    const author = metadata ? clean(firstNamed(metadata, "creator")?.textContent) : "";

    const manifest: ManifestItem[] = [];
    const byId = new Map<string, ManifestItem>();
    const manifestNode = firstNamed(root, "manifest");
    for (const node of manifestNode ? elementsNamed(manifestNode, "item") : []) {
        const id = attr(node, "id");
        const href = attr(node, "href");
        if (!id || !href || leavesTheBook(href)) continue;
        const item: ManifestItem = {
            id,
            href: resolveHref(opfPath, href),
            mediaType: attr(node, "media-type").toLowerCase(),
            properties: attr(node, "properties").split(/\s+/).filter(Boolean),
        };
        manifest.push(item);
        byId.set(id, item);
    }

    const spineNode = firstNamed(root, "spine");
    const spine: SpineItem[] = [];
    for (const node of spineNode ? elementsNamed(spineNode, "itemref") : []) {
        const item = byId.get(attr(node, "idref"));
        if (!item || !/html|xml/.test(item.mediaType)) continue;
        spine.push({ href: item.href, linear: attr(node, "linear") !== "no" });
    }

    const images = manifest.filter((item) => item.mediaType.startsWith("image/"));
    const metaCover = metadata
        ? elementsNamed(metadata, "meta").find((node) => attr(node, "name") === "cover")
        : undefined;
    const cover =
        manifest.find((item) => item.properties.includes("cover-image")) ??
        (metaCover ? byId.get(attr(metaCover, "content")) : undefined) ??
        images.find((item) => /cover/i.test(item.id) || /cover/i.test(item.href));
    const nav = manifest.find((item) => item.properties.includes("nav"));
    const tocId = spineNode ? attr(spineNode, "toc") : "";
    const ncx = (tocId ? byId.get(tocId) : undefined) ?? manifest.find((item) => item.mediaType === "application/x-dtbncx+xml");

    return {
        ...(title ? { title } : {}),
        ...(author ? { author } : {}),
        manifest,
        spine,
        ...(cover && cover.mediaType.startsWith("image/") ? { coverHref: cover.href } : {}),
        ...(nav ? { navHref: nav.href } : {}),
        ...(ncx ? { ncxHref: ncx.href } : {}),
    };
}

/** The book's contents from an EPUB 3 `nav` document: the `toc` list, nested as it is nested. */
export function parseNav(navXhtml: string, navPath: string, parse: XmlParse): TocEntry[] {
    const root = parse(navXhtml, "application/xhtml+xml").documentElement;
    if (!root) return [];
    const navs = elementsNamed(root, "nav");
    const toc = navs.find((node) => /\btoc\b/.test(attr(node, "epub:type") || attr(node, "type") || attr(node, "role"))) ?? navs[0];
    if (!toc) return [];
    const out: TocEntry[] = [];
    const walkList = (list: XmlNode, depth: number) => {
        for (const li of children(list).filter((node) => nameOf(node) === "li")) {
            const link = children(li).find((node) => nameOf(node) === "a" || nameOf(node) === "span");
            const href = link ? attr(link, "href") : "";
            const title = clean(link?.textContent);
            if (href && title && !leavesTheBook(href)) {
                const fragment = fragmentOf(href);
                out.push({ title, href: resolveHref(navPath, href), ...(fragment ? { fragment } : {}), depth });
            }
            const nested = children(li).find((node) => nameOf(node) === "ol" || nameOf(node) === "ul");
            if (nested) walkList(nested, depth + 1);
        }
    };
    const list = children(toc).find((node) => nameOf(node) === "ol" || nameOf(node) === "ul");
    if (list) walkList(list, 0);
    return out;
}

/** The book's contents from an EPUB 2 `toc.ncx`. */
export function parseNcx(ncxXml: string, ncxPath: string, parse: XmlParse): TocEntry[] {
    const root = parse(ncxXml, "application/xml").documentElement;
    if (!root) return [];
    const navMap = firstNamed(root, "navmap");
    if (!navMap) return [];
    const out: TocEntry[] = [];
    const walk = (node: XmlNode, depth: number) => {
        for (const point of children(node).filter((child) => nameOf(child) === "navpoint")) {
            const label = firstNamed(point, "navlabel");
            const title = clean(label ? firstNamed(label, "text")?.textContent : "");
            const content = children(point).find((child) => nameOf(child) === "content");
            const href = content ? attr(content, "src") : "";
            if (title && href && !leavesTheBook(href)) {
                const fragment = fragmentOf(href);
                out.push({ title, href: resolveHref(ncxPath, href), ...(fragment ? { fragment } : {}), depth });
            }
            walk(point, depth + 1);
        }
    };
    walk(navMap, 0);
    return out;
}

/**
 * What each spine item is called: the first entry of the contents that points at it. A spine item
 * the contents never name (a cover, a title page) gets `null`, and the reader names it by number.
 */
export function chapterTitles(spine: readonly SpineItem[], toc: readonly TocEntry[]): (string | null)[] {
    const first = new Map<string, string>();
    for (const entry of toc) if (!first.has(entry.href)) first.set(entry.href, entry.title);
    return spine.map((item) => first.get(item.href) ?? null);
}

/** The spine index a contents entry (or a link inside the book) leads to; -1 when none. */
export function spineIndexOf(spine: readonly SpineItem[], href: string): number {
    return spine.findIndex((item) => item.href === href);
}
