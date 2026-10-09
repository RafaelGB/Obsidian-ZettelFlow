import { crc32, deflateRawSync } from "zlib";

/**
 * Write a ZIP in a test (#675) — enough to make EPUBs: stored or deflated entries, a central
 * directory and its end record, as any archiver writes them.
 */
export function makeZip(files: Record<string, string | Uint8Array>, options: { store?: string[] } = {}): Uint8Array {
    const locals: Buffer[] = [];
    const centrals: Buffer[] = [];
    let offset = 0;
    for (const [name, content] of Object.entries(files)) {
        const data = Buffer.from(typeof content === "string" ? Buffer.from(content, "utf8") : content);
        const stored = options.store?.includes(name) ?? false;
        const body = stored ? data : deflateRawSync(data);
        const nameBytes = Buffer.from(name, "utf8");
        const crc = crc32(data);

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6);
        local.writeUInt16LE(stored ? 0 : 8, 8);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(body.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(nameBytes.length, 26);
        locals.push(local, nameBytes, body);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(stored ? 0 : 8, 10);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(body.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(nameBytes.length, 28);
        central.writeUInt32LE(offset, 42);
        centrals.push(central, nameBytes);
        offset += 30 + nameBytes.length + body.length;
    }
    const directory = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    const count = Object.keys(files).length;
    end.writeUInt16LE(count, 8);
    end.writeUInt16LE(count, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);
    return new Uint8Array(Buffer.concat([...locals, directory, end]));
}

export interface FixtureChapter {
    id: string;
    href: string;
    title?: string;
    body: string;
}

/** A small, valid EPUB 3: a package, a nav, chapters and an optional cover. */
export function makeEpub(book: {
    title?: string;
    author?: string;
    chapters: FixtureChapter[];
    cover?: Uint8Array;
    extra?: Record<string, string | Uint8Array>;
    nav?: boolean;
    /** `<spine page-progression-direction>` (#753): a book that reads right to left. */
    direction?: "ltr" | "rtl";
}): Uint8Array {
    const items = book.chapters
        .map((ch) => `<item id="${ch.id}" href="${ch.href}" media-type="application/xhtml+xml"/>`)
        .join("");
    const spine = book.chapters.map((ch) => `<itemref idref="${ch.id}"/>`).join("");
    const navItems = book.chapters
        .filter((ch) => ch.title)
        .map((ch) => `<li><a href="${ch.href}">${ch.title}</a></li>`)
        .join("");
    const files: Record<string, string | Uint8Array> = {
        mimetype: "application/epub+zip",
        "META-INF/container.xml":
            '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
        "OEBPS/content.opf": `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">${book.title ? `<dc:title>${book.title}</dc:title>` : ""}${book.author ? `<dc:creator>${book.author}</dc:creator>` : ""}</metadata><manifest>${book.nav === false ? "" : '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'}${book.cover ? '<item id="cover" href="images/cover.png" media-type="image/png" properties="cover-image"/>' : ""}${items}</manifest><spine${book.direction ? ` page-progression-direction="${book.direction}"` : ""}>${spine}</spine></package>`,
        ...(book.nav === false
            ? {}
            : {
                  "OEBPS/nav.xhtml": `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol>${navItems}</ol></nav></body></html>`,
              }),
        ...(book.cover ? { "OEBPS/images/cover.png": book.cover } : {}),
        ...book.extra,
    };
    for (const ch of book.chapters) {
        files[`OEBPS/${ch.href}`] = `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${ch.title ?? ""}</title></head><body>${ch.body}</body></html>`;
    }
    return makeZip(files, { store: ["mimetype"] });
}
