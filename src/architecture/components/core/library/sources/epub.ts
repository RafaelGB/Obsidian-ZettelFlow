import type { App, TFile } from "obsidian";
import { ZipArchive } from "application/library/zip";
import {
    chapterTitles,
    packagePath,
    parseNav,
    parseNcx,
    parsePackage,
    type EpubPackage,
    type TocEntry,
    type XmlParse,
} from "application/library/epubPackage";

/**
 * **An EPUB, opened** (#680, #682, epic #675): the archive, its package, its contents and what
 * each spine item is called. Read through the Vault API; the file is never written (L5).
 */
export interface OpenEpub {
    archive: ZipArchive;
    pkg: EpubPackage;
    toc: TocEntry[];
    /** Each spine item's name from the contents, or `null`. */
    titles: (string | null)[];
}

/**
 * The platform's parser, as strict as XHTML asks — and, for a book whose chapter is not
 * well-formed XML (many are not), the forgiving HTML parser rather than an error page.
 */
export const domParse: XmlParse = (text, type) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, type);
    if (doc.getElementsByTagName("parsererror").length === 0) return doc;
    return parser.parseFromString(text, "text/html");
};

export async function openEpub(app: App, file: TFile, parse: XmlParse = domParse): Promise<OpenEpub> {
    const archive = new ZipArchive(new Uint8Array(await app.vault.readBinary(file)));
    const container = await archive.text("META-INF/container.xml");
    const opfPath = container ? packagePath(container, parse) : archive.names().find((name) => name.endsWith(".opf")) ?? null;
    const opf = opfPath ? await archive.text(opfPath) : null;
    const pkg = opf && opfPath ? parsePackage(opf, opfPath, parse) : { manifest: [], spine: [] };
    let toc: TocEntry[] = [];
    if (pkg.navHref) {
        const nav = await archive.text(pkg.navHref);
        if (nav) toc = parseNav(nav, pkg.navHref, parse);
    }
    if (toc.length === 0 && pkg.ncxHref) {
        const ncx = await archive.text(pkg.ncxHref);
        if (ncx) toc = parseNcx(ncx, pkg.ncxHref, parse);
    }
    return { archive, pkg, toc, titles: chapterTitles(pkg.spine, toc) };
}

/** The media type of an image inside the book, from its manifest entry or its extension. */
export function imageType(book: OpenEpub, href: string): string {
    const declared = book.pkg.manifest.find((item) => item.href === href)?.mediaType;
    if (declared?.startsWith("image/")) return declared;
    const ext = href.split(".").pop()?.toLowerCase() ?? "";
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    if (ext === "svg") return "image/svg+xml";
    return ext ? `image/${ext}` : "application/octet-stream";
}
