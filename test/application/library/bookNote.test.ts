import { describe, it, expect } from "@jest/globals";
import {
    BOOK_LINK_KEY,
    BOOK_STATUSES,
    bookNoteFields,
    bookNoteFileName,
    bookNoteMarkdown,
    declaredFromPackage,
    declaredFromPdf,
    effectiveStatus,
    fieldText,
    foldDetailFields,
    statusOnOpen,
    freeBookNotePath,
    indexBookNotes,
    isbnOf,
    linkTarget,
    parseField,
    readBookNote,
    yearOf,
} from "application/library/bookNote";
import { parsePackage } from "application/library/epubPackage";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";
import { miniParse } from "../../support/miniXml";

describe("a book's note, read (#743 AC-1)", () => {
    it("reads the fields under their plain names, a string or a list alike", () => {
        expect(
            readBookNote({
                book: "[[Books/Thinking, Fast and Slow.epub]]",
                title: "Thinking, Fast and Slow",
                author: "Daniel Kahneman",
                series: "Penguin Psychology",
                publisher: "Farrar, Straus and Giroux",
                year: "2011",
                language: "en",
                isbn: "9780374275631",
                tags: ["#psychology", "decisions"],
                status: "reading",
                collections: "Planning",
            })
        ).toEqual({
            title: "Thinking, Fast and Slow",
            author: ["Daniel Kahneman"],
            series: "Penguin Psychology",
            publisher: "Farrar, Straus and Giroux",
            year: 2011,
            language: "en",
            isbn: "9780374275631",
            tags: ["psychology", "decisions"],
            status: "reading",
            collections: ["Planning"],
        });
        expect(readBookNote({ author: ["A", "B", "A", ""], collections: ["Planning", "Software design"] })).toEqual({
            author: ["A", "B"],
            collections: ["Planning", "Software design"],
        });
    });

    it("ignores an unknown status and never reads a key that is not its own", () => {
        const details = readBookNote({ status: "abandoned", rating: 5, file: "x", aliases: ["y"] });
        expect(details).toEqual({});
        expect(readBookNote(null)).toEqual({});
        expect(readBookNote(["x"])).toEqual({});
    });

    it("reads a year however it is written", () => {
        expect(yearOf(2011)).toBe(2011);
        expect(yearOf("2011-10-25")).toBe(2011);
        expect(yearOf("soon")).toBeUndefined();
        expect(yearOf(-3)).toBeUndefined();
    });
});

describe("its status (#743 AC-2)", () => {
    it("is read from the reading while it is unset, and nothing is written for it", () => {
        expect(effectiveStatus(undefined, { done: true, at: 5 })).toBe("finished");
        expect(effectiveStatus({}, { at: 5 })).toBe("reading");
        expect(effectiveStatus({}, undefined)).toBeNull();
    });

    it("is yours once you set it", () => {
        expect(effectiveStatus({ status: "to-read" }, { done: true, at: 5 })).toBe("to-read");
        expect(effectiveStatus({ status: "finished" }, undefined)).toBe("finished");
    });

    it("is stored as the same three values in every language", () => {
        // What you read on the chip is the language's; what the note keeps is not.
        expect([en.shelf_status_to_read, es.shelf_status_to_read]).toEqual(["Want to read", "Quiero leerlo"]);
        expect(BOOK_STATUSES).toEqual(["to-read", "reading", "finished"]);
        expect(bookNoteFields("b.epub", {}, { status: "to-read" })).toEqual({ book: "[[b.epub]]", status: "to-read" });
    });
});

describe("its first write (#743 FR-5, FR-6)", () => {
    it("links the book, fills in what the file declares and lays your change on top", () => {
        expect(BOOK_LINK_KEY).toBe("book");
        const fields = bookNoteFields(
            "Books/Thinking, Fast and Slow.epub",
            { title: "Thinking, Fast and Slow", author: ["Daniel Kahneman"], year: 2011, language: "en" },
            { status: "to-read", year: 2013, language: null }
        );
        expect(fields).toEqual({
            book: "[[Books/Thinking, Fast and Slow.epub]]",
            title: "Thinking, Fast and Slow",
            author: ["Daniel Kahneman"],
            year: 2013,
            status: "to-read",
        });
        expect(Object.keys(fields)).toEqual(["book", "title", "author", "year", "status"]);
    });

    it("writes a frontmatter block Obsidian's properties read as they are", () => {
        expect(bookNoteMarkdown({ book: "[[Books/a.epub]]", author: ["Daniel Kahneman"], year: 2011, collections: ['Say "hi"'] })).toBe(
            ['---', 'book: "[[Books/a.epub]]"', "author:", '  - "Daniel Kahneman"', "year: 2011", "collections:", '  - "Say \\"hi\\""', "---", ""].join("\n")
        );
    });

    it("names the note after the book, safely, at a free path", () => {
        expect(bookNoteFileName('Why? A "study" of #tags: [x] / y | z ^')).toBe("Why A study of tags x y z");
        expect(bookNoteFileName("...")).toBe("Book");
        const taken = new Set(["Library/Thinking, Fast and Slow.md", "Library/Thinking, Fast and Slow 1.md"]);
        expect(freeBookNotePath("Library", "Thinking, Fast and Slow", (p) => taken.has(p))).toBe("Library/Thinking, Fast and Slow 2.md");
        expect(freeBookNotePath("/Reading notes/", "Dune", () => false)).toBe("Reading notes/Dune.md");
        expect(freeBookNotePath("", "Dune", () => false)).toBe("Dune.md");
    });
});

describe("found by its link, never by its folder (#743 AC-12)", () => {
    it("indexes every note that links a book, wherever it is kept, the first by path when two claim one", () => {
        const index = indexBookNotes([
            { path: "Old place/Dune.md", source: "Books/Dune.epub", frontmatter: { status: "finished" } },
            { path: "Library/Paper.md", source: "Papers/cap.pdf", frontmatter: { collections: ["Planning"] } },
            { path: "Archive/Dune again.md", source: "Books/Dune.epub", frontmatter: { status: "to-read" } },
            { path: "Library/Not a book.md", source: "notes/a.md", frontmatter: {} },
        ]);
        expect([...index.keys()]).toEqual(["Books/Dune.epub", "Papers/cap.pdf"]);
        expect(index.get("Books/Dune.epub")).toEqual({ path: "Archive/Dune again.md", source: "Books/Dune.epub", details: { status: "to-read" } });
    });

    it("reads a link out of a frontmatter value", () => {
        expect(linkTarget("[[Books/Dune.epub]]")).toBe("Books/Dune.epub");
        expect(linkTarget(["[[Books/Dune.epub|Dune]]"])).toBe("Books/Dune.epub");
        expect(linkTarget("Books/Dune.epub")).toBeNull();
        expect(linkTarget(3)).toBeNull();
    });
});

describe("what a field means as you type it (#743 FR-8)", () => {
    it("splits authors and tags, checks a year and an ISBN, and an empty field removes its key", () => {
        expect(parseField("author", "Moseley, Ben; Marks, Peter")).toEqual({ author: ["Moseley, Ben", "Marks, Peter"] });
        expect(parseField("tags", "#psychology, decisions")).toEqual({ tags: ["psychology", "decisions"] });
        expect(parseField("year", "2011")).toEqual({ year: 2011 });
        expect(parseField("year", "next year")).toBeUndefined();
        expect(parseField("isbn", "978-0-374-27563-1")).toEqual({ isbn: "9780374275631" });
        expect(parseField("isbn", "12")).toBeUndefined();
        expect(parseField("series", "   ")).toEqual({ series: null });
        expect(parseField("title", " Dune ")).toEqual({ title: "Dune" });
        expect(fieldText({ author: ["A", "B"], tags: ["x", "y"], year: 2011 }, "author")).toBe("A; B");
        expect(fieldText({ tags: ["x", "y"] }, "tags")).toBe("x, y");
        expect(fieldText({ year: 2011 }, "year")).toBe("2011");
        expect(fieldText({}, "publisher")).toBe("");
        expect(isbnOf("urn:isbn:0-306-40615-X")).toBe("030640615X");
    });
});

describe("what a book declares (#743 FR-5)", () => {
    const parse = miniParse as unknown as Parameters<typeof parsePackage>[2];
    const opf = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/" version="3.0"><metadata>
        <dc:title>Thinking, Fast and Slow</dc:title>
        <dc:creator>Daniel Kahneman</dc:creator><dc:creator>Someone Else</dc:creator>
        <dc:publisher>Farrar, Straus and Giroux</dc:publisher>
        <dc:date>2011-10-25</dc:date>
        <dc:language>en</dc:language>
        <dc:identifier>uuid:1234</dc:identifier><dc:identifier>urn:isbn:978-0-374-27563-1</dc:identifier>
        <meta name="calibre:series" content="Penguin Psychology"/>
    </metadata><manifest><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>`;

    it("reads the package's creator, publisher, date, language, identifier and series", () => {
        const pkg = parsePackage(opf, "OEBPS/content.opf", parse);
        expect(pkg).toMatchObject({
            author: "Daniel Kahneman",
            authors: ["Daniel Kahneman", "Someone Else"],
            publisher: "Farrar, Straus and Giroux",
            date: "2011-10-25",
            identifiers: ["uuid:1234", "urn:isbn:978-0-374-27563-1"],
            series: "Penguin Psychology",
        });
        expect(declaredFromPackage(pkg)).toEqual({
            title: "Thinking, Fast and Slow",
            author: ["Daniel Kahneman", "Someone Else"],
            series: "Penguin Psychology",
            publisher: "Farrar, Straus and Giroux",
            year: 2011,
            language: "en",
            isbn: "9780374275631",
        });
    });

    it("prefers the EPUB 3 collection over Calibre's series", () => {
        const three = opf.replace('<meta name="calibre:series" content="Penguin Psychology"/>', '<meta property="belongs-to-collection" id="c">The Dune Chronicles</meta><meta name="calibre:series" content="Other"/>');
        expect(parsePackage(three, "OEBPS/content.opf", parse).series).toBe("The Dune Chronicles");
    });

    it("reads a PDF's title and authors", () => {
        expect(declaredFromPdf({ title: "Brewer's conjecture", author: "Seth Gilbert; Nancy Lynch" })).toEqual({
            title: "Brewer's conjecture",
            author: ["Seth Gilbert", "Nancy Lynch"],
        });
        expect(declaredFromPdf({})).toEqual({});
    });
});

describe("which details show (#822 AC-4)", () => {
    it("shows the title and what holds something, the rest folded", () => {
        expect(foldDetailFields({ author: ["Kahneman"], year: 2011 }, {}, true)).toEqual({
            shown: ["title", "author", "year"],
            folded: ["series", "publisher", "language", "isbn", "citekey", "tags"],
        });
        // Before a note, the author the shelf knows counts.
        expect(foldDetailFields({}, { author: "Kahneman" }, false).shown).toEqual(["title", "author"]);
        expect(foldDetailFields({}, {}, false).shown).toEqual(["title"]);
        expect(foldDetailFields({}, {}, true, "citekey").shown).toEqual(["title", "citekey"]);
    });
});

describe("Want to read, then opened (#822 AC-11..AC-14)", () => {
    it("becomes Reading once, only on a status shelf", () => {
        expect(statusOnOpen({ status: "to-read" }, false)).toEqual({ status: "reading" });
        expect(statusOnOpen({ status: "to-read" }, true)).toBeNull();
        for (const status of ["reading", "finished", undefined] as const) expect(statusOnOpen(status ? { status } : {}, false)).toBeNull();
        expect(statusOnOpen(undefined, false)).toBeNull();
        // Written, the note says Reading: it never fires again.
        expect(statusOnOpen({ status: "reading" }, false)).toBeNull();
    });
});
