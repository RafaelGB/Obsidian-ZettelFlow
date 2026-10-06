import { describe, it, expect } from "@jest/globals";
import { ZipArchive, ZipError, readZipDirectory, MAX_ENTRY_BYTES, readZipEntry } from "application/library/zip";
import {
    chapterTitles,
    fragmentOf,
    leavesTheBook,
    packagePath,
    parseNav,
    parseNcx,
    parsePackage,
    resolveHref,
    spineIndexOf,
} from "application/library/epubPackage";
import { makeEpub, makeZip } from "../../support/zipFixture";
import { miniParse } from "../../support/miniXml";

const parse = miniParse as unknown as Parameters<typeof parsePackage>[2];

describe("a small unzip, with the platform's own inflate (#680)", () => {
    it("lists the entries and reads stored and deflated ones alike", async () => {
        const zip = makeZip({ mimetype: "application/epub+zip", "a/b.txt": "hello ".repeat(200) }, { store: ["mimetype"] });
        const archive = new ZipArchive(zip);
        expect(archive.names()).toEqual(["mimetype", "a/b.txt"]);
        expect(await archive.text("mimetype")).toBe("application/epub+zip");
        expect(await archive.text("a/b.txt")).toBe("hello ".repeat(200));
        expect(await archive.text("missing")).toBeNull();
    });

    it("finds an entry a book links URL-encoded", async () => {
        const archive = new ZipArchive(makeZip({ "My Chapter.xhtml": "x" }));
        expect(await archive.text("My%20Chapter.xhtml")).toBe("x");
    });

    it("refuses what is not a zip, and an entry that claims to be bigger than any book", async () => {
        expect(() => readZipDirectory(new Uint8Array([1, 2, 3]))).toThrow(ZipError);
        const zip = makeZip({ a: "x" });
        const [entry] = readZipDirectory(zip);
        await expect(readZipEntry(zip, { ...entry, size: MAX_ENTRY_BYTES + 1 }, async (d) => d)).rejects.toThrow(ZipError);
    });
});

describe("an EPUB's package (#680)", () => {
    const book = makeEpub({
        title: "Thinking, Fast and Slow",
        author: "Daniel Kahneman",
        cover: new Uint8Array([137, 80, 78, 71]),
        chapters: [
            { id: "c0", href: "text/cover.xhtml", body: "<p>cover</p>" },
            { id: "c1", href: "text/ch1.xhtml", title: "1 · The characters of the story", body: "<p>One</p>" },
            { id: "c2", href: "text/ch2.xhtml", title: "2 · Attention and effort", body: "<p>Two</p>" },
        ],
    });

    it("reads the container, the title, the author, the spine and the cover", async () => {
        const archive = new ZipArchive(book);
        const opfPath = packagePath((await archive.text("META-INF/container.xml"))!, parse)!;
        expect(opfPath).toBe("OEBPS/content.opf");
        const pkg = parsePackage((await archive.text(opfPath))!, opfPath, parse);
        expect(pkg.title).toBe("Thinking, Fast and Slow");
        expect(pkg.author).toBe("Daniel Kahneman");
        expect(pkg.spine.map((s) => s.href)).toEqual(["OEBPS/text/cover.xhtml", "OEBPS/text/ch1.xhtml", "OEBPS/text/ch2.xhtml"]);
        expect(pkg.coverHref).toBe("OEBPS/images/cover.png");
        expect(await archive.bytes(pkg.coverHref!)).toEqual(new Uint8Array([137, 80, 78, 71]));
        expect(pkg.navHref).toBe("OEBPS/nav.xhtml");
    });

    it("names each spine item from the book's own contents, and leaves the unnamed ones to the reader", async () => {
        const archive = new ZipArchive(book);
        const pkg = parsePackage((await archive.text("OEBPS/content.opf"))!, "OEBPS/content.opf", parse);
        const toc = parseNav((await archive.text(pkg.navHref!))!, pkg.navHref!, parse);
        expect(toc.map((e) => [e.title, e.href])).toEqual([
            ["1 · The characters of the story", "OEBPS/text/ch1.xhtml"],
            ["2 · Attention and effort", "OEBPS/text/ch2.xhtml"],
        ]);
        expect(chapterTitles(pkg.spine, toc)).toEqual([null, "1 · The characters of the story", "2 · Attention and effort"]);
        expect(spineIndexOf(pkg.spine, "OEBPS/text/ch2.xhtml")).toBe(2);
    });

    it("finds the cover an EPUB 2 names in its metadata", () => {
        const opf =
            '<package><metadata><meta name="cover" content="img"/></metadata><manifest><item id="img" href="c.jpg" media-type="image/jpeg"/><item id="t" href="t.html" media-type="application/xhtml+xml"/></manifest><spine toc="ncx"><itemref idref="t"/><itemref idref="nope"/></spine></package>';
        const pkg = parsePackage(opf, "content.opf", parse);
        expect(pkg.coverHref).toBe("c.jpg");
        expect(pkg.spine).toEqual([{ href: "t.html", linear: true }]);
        expect(pkg.title).toBeUndefined();
    });

    it("reads an EPUB 2 toc.ncx, nested", () => {
        const ncx =
            '<ncx><navMap><navPoint><navLabel><text>Part I</text></navLabel><content src="p1.html"/><navPoint><navLabel><text>Chapter 1</text></navLabel><content src="c1.html#start"/></navPoint></navPoint></navMap></ncx>';
        expect(parseNcx(ncx, "OEBPS/toc.ncx", parse)).toEqual([
            { title: "Part I", href: "OEBPS/p1.html", depth: 0 },
            { title: "Chapter 1", href: "OEBPS/c1.html", fragment: "start", depth: 1 },
        ]);
    });

    it("resolves a book's URLs inside the archive, and knows the ones that leave it", () => {
        expect(resolveHref("OEBPS/text/ch1.xhtml", "../images/a%20b.png")).toBe("OEBPS/images/a b.png");
        expect(resolveHref("OEBPS/text/ch1.xhtml", "ch2.xhtml#x")).toBe("OEBPS/text/ch2.xhtml");
        expect(fragmentOf("ch2.xhtml#note-3")).toBe("note-3");
        for (const href of ["https://example.com", "javascript:alert(1)", "mailto:a@b", "//evil.example", "data:text/html,x"]) {
            expect(leavesTheBook(href)).toBe(true);
        }
        expect(leavesTheBook("ch2.xhtml")).toBe(false);
    });

    it("never takes a manifest entry that leaves the book", () => {
        const opf =
            '<package><manifest><item id="x" href="https://evil.example/ch.html" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="x"/></spine></package>';
        expect(parsePackage(opf, "content.opf", parse).spine).toEqual([]);
    });
});
