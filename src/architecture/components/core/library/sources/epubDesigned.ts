import { c, log } from "architecture";
import {
    bindAssets,
    cleanDesignedCss,
    defendRules,
    designedHead,
    svgPageSize,
    type DesignedCssBook,
    type DesignedFont,
    type PageSize,
} from "application/library/epubFixedLayout";
import { bodyOf, chapterLanguage, designedAttributes, sanitizeChapter, sanitizeSvg, type ChapterBuilder, type SourceNode } from "application/library/epubSanitize";
import type { XmlParse } from "application/library/epubPackage";
import { MOTION } from "architecture/components/core/reader/readerMotion";

/**
 * **A designed page, drawn inside its own page** (#771, epic #739). A fixed-layout page is rebuilt
 * node by node by the sanitiser's *designed* policy (L4, as every chapter is) into an **open shadow
 * root** on a host in the Reader's page, and the book's *cleaned* CSS is adopted by that root alone, as
 * a constructed stylesheet. Its fonts are read from the archive and loaded under names of ours.
 *
 * - **The shadow root is the style boundary** (FR-2, FR-3): the page's look reaches nothing outside
 *   it, and no theme reaches into it. It is **never** relied on for security.
 * - **Script and network are the sanitiser's and the cleaner's** (FR-4): nothing runs, no element that
 *   loads (`style`, `link`, `script`) is ever made, every URL the page holds is a `blob:` we minted from
 *   the archive, and the parsed sheet is checked again (`defendRules`).
 * - **No platform, no page**: where shadow roots, constructed sheets or `FontFace` are missing, the page
 *   fails into its calm line — it is never drawn with its styles loose in the app.
 *
 * The root is open: it is not the boundary, and the turn and the shot copy the page through it.
 */

/** What the platform must have for a designed page to be drawn at all. */
export function designedSupported(win: Window): boolean {
    const w = win as unknown as { ShadowRoot?: { prototype?: object }; CSSStyleSheet?: unknown; FontFace?: unknown };
    const proto = w.ShadowRoot?.prototype;
    return typeof w.CSSStyleSheet === "function" && typeof w.FontFace === "function" && typeof proto === "object" && proto !== null && "adoptedStyleSheets" in proto;
}

/** The page's own ground, first in its sheet: the book's `html` and `body` rules come after, and win. */
const PAGE_BASE =
    "[data-zf-html],[data-zf-body]{display:block;position:relative;margin:0;padding:0;width:100%;height:100%;box-sizing:border-box;overflow:hidden}" +
    "[data-zf-html]{color-scheme:light;background-color:Canvas;color:CanvasText;font-family:serif;font-size:16px;line-height:normal}" +
    "img,svg{max-width:none}";

/** How long a page's pictures outlive it: a turn copies the page, and the copy reads the same URLs. */
const RELEASE_AFTER_MS = MOTION.turn + MOTION.base;

/** The bytes of pictures one page may hold (#771 review S5): past it, a picture is simply not drawn. */
const MAX_PAGE_BYTES = 96 * 1024 * 1024;

/** The book's own fonts, loaded once for the reading under our names, and let go when it closes. */
export class DesignedFonts {
    private readonly faces = new Map<string, { face: FontFace; fonts: FontFaceSet }>();
    private readonly loading = new Map<string, Promise<void>>();

    /** Load every face of `wanted` not loaded yet, from the archive; one that fails is skipped. */
    ensure(doc: Document | undefined, win: Window, wanted: readonly DesignedFont[], read: (path: string) => Promise<Uint8Array | null>): Promise<void> {
        const Face = (win as Window & { FontFace?: typeof FontFace }).FontFace;
        if (!Face || !doc?.fonts) return Promise.resolve();
        const jobs = wanted.map((font) => {
            const key = `${font.family}|${font.path}|${font.weight ?? ""}|${font.style ?? ""}`;
            const known = this.loading.get(key);
            if (known) return known;
            const job = (async () => {
                try {
                    const bytes = await read(font.path);
                    if (!bytes) return;
                    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
                    const face = new Face(font.family, buffer, { ...(font.weight ? { weight: font.weight } : {}), ...(font.style ? { style: font.style } : {}) });
                    await face.load();
                    doc.fonts.add(face);
                    this.faces.set(key, { face, fonts: doc.fonts });
                } catch (error) {
                    log.debug(`[Reader] a font of a designed page cannot be read (${font.path}): ${String(error)}`);
                }
            })();
            this.loading.set(key, job);
            return job;
        });
        return Promise.all(jobs).then(() => undefined);
    }

    /** The reading is over: every face it loaded is taken out of the document. */
    close(): void {
        for (const { face, fonts } of this.faces.values()) fonts.delete(face);
        this.faces.clear();
        this.loading.clear();
    }

    /** The families loaded, for the tests and the walk. */
    families(): string[] {
        return [...this.faces.values()].map(({ face }) => face.family);
    }
}

/** What drawing a designed page needs from the book it is in. */
export interface DesignedBook {
    text(path: string): Promise<string | null>;
    bytes(path: string): Promise<Uint8Array | null>;
    imageType(path: string): string;
    parse: XmlParse;
    builder: ChapterBuilder<Element>;
    css: DesignedCssBook;
    fonts: DesignedFonts;
}

/** A designed page on the page: its host, and how to let go of what it holds. */
export interface DesignedDrawing {
    host: HTMLElement;
    release(): void;
}

/** A page's own size, read from its file: its viewport, or an SVG page's box. Null when it says none. */
export async function designedPageSize(book: Pick<DesignedBook, "text" | "parse">, href: string): Promise<PageSize | null> {
    const root = await pageRoot(book, href);
    if (!root) return null;
    return nameOf(root) === "svg" ? svgPageSize(root) : designedHead(root, href).viewport;
}

async function pageRoot(book: Pick<DesignedBook, "text" | "parse">, href: string): Promise<SourceNode | null> {
    const text = await book.text(href);
    if (text === null) return null;
    const doc = book.parse(text, /\.svg$/i.test(href) ? "application/xml" : "application/xhtml+xml");
    return doc.documentElement ?? null;
}

function nameOf(node: SourceNode): string {
    const raw = node.localName ?? node.nodeName;
    const colon = raw.indexOf(":");
    return (colon >= 0 ? raw.slice(colon + 1) : raw).toLowerCase();
}

/**
 * Draw the designed page `href` into `into`, at `size` (FR-2): a host with an open shadow root, the
 * page rebuilt inside it, its cleaned CSS adopted by that root only. Throws when the page cannot be
 * drawn — the caller shows the calm line (FR-10).
 */
export async function drawDesignedPage(book: DesignedBook, href: string, into: HTMLElement, size: PageSize): Promise<DesignedDrawing> {
    const win = into.win ?? window;
    if (!designedSupported(win)) throw new Error("this device cannot draw a designed page in its own boundary");
    const root = await pageRoot(book, href);
    if (!root) throw new Error(`no page ${href}`);
    const svg = nameOf(root) === "svg";
    const head = svg ? { viewport: null, sheets: [], styles: [] } : designedHead(root, href);
    const sheets: { text: string; href: string }[] = [];
    for (const path of head.sheets) {
        const text = await book.text(path);
        if (text !== null) sheets.push({ text, href: path });
    }
    for (const text of head.styles) sheets.push({ text, href });

    const host = into.createDiv({ cls: c("reader-designed-host") });
    host.setCssProps({ "--zf-fxl-w": `${size.width}px`, "--zf-fxl-h": `${size.height}px` });
    const shadow = host.attachShadow({ mode: "open" });
    // The page's `html` and `body`, as two plain boxes carrying fixed flags its CSS is rewritten to.
    const htmlBox = shadow.createDiv({ attr: { "data-zf-html": "" } });
    const bodyBox = htmlBox.createDiv({ attr: { "data-zf-body": "" } });
    const language = chapterLanguage(root);
    if (language) htmlBox.setAttr("lang", language);
    const inline: string[] = [];
    let styles: string[] = [];
    let images: string[];
    if (svg) {
        images = sanitizeSvg(root, bodyBox, book.builder, href).images;
    } else {
        const body = bodyOf(root);
        // The page's own `<html>` and `<body>` look: their class, id and style, as everything else's.
        for (const [box, node] of [[htmlBox, root], [bodyBox, body]] as const) {
            if (node === body && body === root) continue;
            for (const [name, value] of Object.entries(designedAttributes(node, inline))) box.setAttr(name, value);
        }
        const result = sanitizeChapter(body, bodyBox, book.builder, href, { policy: "designed", inline });
        images = result.images;
        styles = result.styles ?? [];
    }
    for (const text of styles) sheets.push({ text, href });
    const cleaned = cleanDesignedCss({ sheets, inline, href }, book.css);

    const minted: string[] = [];
    const byPath = new Map<string, string | null>();
    // Minted and revoked by the page's own window: a pop-out that closes takes its URLs with it (review S5).
    const Url = (win as Window & { URL?: typeof URL }).URL ?? URL;
    let held = 0;
    const mint = async (path: string): Promise<string | null> => {
        if (byPath.has(path)) return byPath.get(path) ?? null;
        let url: string | null = null;
        try {
            const bytes = await book.bytes(path);
            if (bytes && held + bytes.byteLength <= MAX_PAGE_BYTES) {
                held += bytes.byteLength;
                url = Url.createObjectURL(new Blob([bytes as BlobPart], { type: book.imageType(path) }));
                minted.push(url);
            }
        } catch (error) {
            log.debug(`[Reader] a picture of a designed page cannot be read (${path}): ${String(error)}`);
        }
        byPath.set(path, url);
        return url;
    };
    let released = false;
    const release = () => {
        if (released) return;
        released = true;
        // Once the turn that copies the page has played (#770): the copy reads the same URLs.
        win.setTimeout(() => minted.forEach((url) => Url.revokeObjectURL(url)), RELEASE_AFTER_MS);
    };
    try {
        // A picture, and a drawing's own: read from the archive, never from a URL (FR-4).
        for (const el of Array.from(bodyBox.querySelectorAll("img, image"))) {
            const path = el.getAttribute("data-zf-src");
            const url = path && images.includes(path) ? await mint(path) : null;
            if (url) el.setAttribute(el.namespaceURI === "http://www.w3.org/2000/svg" ? "href" : "src", url);
        }
        const urls: (string | null)[] = [];
        for (const path of cleaned.assets) urls.push(await mint(path));
        await book.fonts.ensure(into.doc, win, book.css.fonts, (path) => book.bytes(path));
        const Sheet = (win as Window & { CSSStyleSheet: typeof CSSStyleSheet }).CSSStyleSheet;
        const sheet = new Sheet();
        sheet.replaceSync(`${PAGE_BASE}\n${bindAssets(cleaned.css, urls)}`);
        // The second check, on the sheet as the platform parsed it: only our own URLs are left.
        const removed = defendRules(sheet, new Set(minted));
        if (removed > 0) log.debug(`[Reader] ${removed} rules of ${href} removed after parsing`);
        shadow.adoptedStyleSheets = [sheet];
    } catch (error) {
        release();
        host.remove();
        throw error;
    }
    return { host, release };
}
