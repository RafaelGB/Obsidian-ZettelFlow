import { describe, it, expect } from "@jest/globals";
import {
    CSL_KEYS,
    bibEscape,
    citationFields,
    citeFormOf,
    citeKey,
    citeLink,
    formatCitation,
    locatorText,
    missingFor,
    parseAuthors,
    proposedKey,
    type CiteFields,
    type CiteInput,
} from "application/library/citation";
import { indexBookNotes, parseField, readBookNote } from "application/library/bookNote";
import { articleFields } from "application/library/article";

/**
 * **Cite a passage** (#768). Literal strings, no snapshots: every form, over every fixture, is the
 * exact text the panel shows and *Copy* puts on the clipboard.
 */

const BOOK = "Books/Thinking, Fast and Slow.epub";
const PASSAGE = "A general law of least effort applies to cognitive as well as physical exertion.";

/** The book's note, kept apart from the book — in *Reading notes/* — and found by its link (#743). */
function kahneman(): CiteFields {
    const notes = indexBookNotes([
        {
            path: "Reading notes/Thinking, Fast and Slow.md",
            source: BOOK,
            frontmatter: {
                book: `[[${BOOK}]]`,
                title: "Thinking, Fast and Slow",
                author: ["Daniel Kahneman"],
                publisher: "Farrar, Straus and Giroux",
                year: 2011,
                language: "en",
                isbn: "9780374275631",
            },
        },
    ]);
    return citationFields({ kind: "book", fileTitle: "Thinking, Fast and Slow", details: notes.get(BOOK)!.details });
}

const link = citeLink(BOOK, "Thinking, Fast and Slow", "OEBPS/ch03.xhtml");
const full = (place: CiteInput["place"], passage: string | undefined = PASSAGE): CiteInput => ({ fields: kahneman(), place, ...(passage ? { passage } : {}), link });

describe("authors, read as written (FR-6)", () => {
    it("reads Family, Given and Given Family, one per entry or joined by and / &", () => {
        expect(parseAuthors(["Kahneman, Daniel"])).toEqual([{ family: "Kahneman", given: "Daniel" }]);
        expect(parseAuthors(["Daniel Kahneman"])).toEqual([{ family: "Kahneman", given: "Daniel" }]);
        expect(parseAuthors(["Daniel Kahneman and Amos Tversky"])).toEqual([
            { family: "Kahneman", given: "Daniel" },
            { family: "Tversky", given: "Amos" },
        ]);
        expect(parseAuthors(["Kahneman, Daniel & Tversky, Amos"])).toEqual([
            { family: "Kahneman", given: "Daniel" },
            { family: "Tversky", given: "Amos" },
        ]);
        expect(parseAuthors(["Daniel Kahneman", "Amos Tversky"])).toHaveLength(2);
    });

    it("takes a name of one word as a family name, and keeps a particle written first", () => {
        expect(parseAuthors(["Plato"])).toEqual([{ family: "Plato" }]);
        expect(parseAuthors(["van Rossum, Guido"])).toEqual([{ family: "van Rossum", given: "Guido" }]);
        expect(parseAuthors(undefined)).toEqual([]);
        expect(parseAuthors(["  "])).toEqual([]);
    });
});

describe("the fields, from what the vault holds (FR-3)", () => {
    it("reads the book's note and nothing else; a field not there is not there", () => {
        expect(kahneman()).toEqual({
            kind: "book",
            title: "Thinking, Fast and Slow",
            authors: [{ family: "Kahneman", given: "Daniel" }],
            year: 2011,
            publisher: "Farrar, Straus and Giroux",
            isbn: "9780374275631",
            language: "en",
        });
        expect(citationFields({ kind: "paper", fileTitle: "Reference class forecasting" })).toEqual({ kind: "paper", title: "Reference class forecasting", authors: [] });
    });

    it("reads an article's own frontmatter: its byline, its year, its address and the day it was saved", () => {
        const fm = { title: "The web we lost", author: ["[[Anil Dash]]"], published: "2012-12-13", source: "https://example.com/lost", created: "2025-03-02T10:15" };
        const article = articleFields(fm);
        const fields = citationFields({ kind: "article", fileTitle: "The web we lost", details: article.details, url: fm.source, created: article.created });
        expect(fields).toEqual({ kind: "article", title: "The web we lost", authors: [{ family: "Dash", given: "Anil" }], year: 2012, url: "https://example.com/lost", urldate: "2025-03-02" });
    });

    it("cites a PDF with an ISBN as a book", () => {
        expect(citationFields({ kind: "paper", fileTitle: "x", details: { isbn: "9780374275631" } }).kind).toBe("book");
    });

    it("keeps the note's citekey, and the Details field saves only a key Pandoc can cite (AC-6)", () => {
        expect(readBookNote({ citekey: "kahneman:thinking" }).citekey).toBe("kahneman:thinking");
        expect(parseField("citekey", "kahneman2011")).toEqual({ citekey: "kahneman2011" });
        expect(parseField("citekey", "")).toEqual({ citekey: null });
        expect(parseField("citekey", "two words")).toBeUndefined();
        expect(parseField("citekey", "@kahneman")).toBeUndefined();
    });
});

describe("the citation key (FR-5, AC-3)", () => {
    it("proposes family, year and the first significant title word, in lowercase ASCII", () => {
        expect(citeKey(kahneman())).toBe("kahneman2011thinking");
        expect(proposedKey({ title: "Wie man digitale Notizen macht", authors: [{ family: "Ahrens", given: "Sönke" }], year: 2017 })).toBe("ahrens2017wie");
        expect(proposedKey({ title: "Ética", authors: [{ family: "Núñez" }], year: 2001 })).toBe("nunez2001etica");
        expect(proposedKey({ title: "The Black Swan", authors: [{ family: "Taleb" }], year: 2007 })).toBe("taleb2007black");
        expect(proposedKey({ title: "A Theory of Justice", authors: [{ family: "Rawls" }] })).toBe("rawlstheory");
        expect(proposedKey({ title: "Reference class forecasting", authors: [] })).toBe("reference");
    });

    it("cites by the note's own key when it has one", () => {
        expect(citeKey({ ...kahneman(), citekey: "dk-tfs" })).toBe("dk-tfs");
    });
});

describe("the place", () => {
    it("says a page, pages, a chapter, or a section as the book names it", () => {
        expect(locatorText({ page: "42" })).toBe("p. 42");
        expect(locatorText({ page: "42-43" })).toBe("pp. 42–43");
        expect(locatorText({ chapter: "3 · The lazy controller" })).toBe("ch. 3");
        expect(locatorText({ chapter: "Chapter 12" })).toBe("ch. 12");
        expect(locatorText({ chapter: "Introduction" })).toBe("Introduction");
        expect(locatorText({ page: "42", chapter: "3 · The lazy controller" })).toBe("p. 42");
        expect(locatorText(undefined)).toBeUndefined();
    });
});

describe("the five forms, exactly (FR-2, AC-1)", () => {
    it("Markdown: the passage as a quote, the line, and the link back of #751 — never a block id", () => {
        expect(link).toBe("[[Books/Thinking, Fast and Slow.epub#OEBPS/ch03.xhtml|Thinking, Fast and Slow]]");
        expect(formatCitation("markdown", full({ page: "42" }))).toBe(
            "> A general law of least effort applies to cognitive as well as physical exertion.\n" +
                "> — Daniel Kahneman, *Thinking, Fast and Slow* (2011), p. 42 · [[Books/Thinking, Fast and Slow.epub#OEBPS/ch03.xhtml|Thinking, Fast and Slow]]"
        );
        expect(formatCitation("markdown", full({ chapter: "3 · The lazy controller" }))).toContain("(2011), ch. 3 · [[");
        expect(formatCitation("markdown", full({ page: "42" }))).not.toMatch(/\^[\w-]+\]\]/);
    });

    it("Markdown keeps a passage's paragraphs, and a whole book is its line alone", () => {
        expect(formatCitation("markdown", full({ page: "42" }, "One.\n\nTwo  words."))).toBe(
            "> One.\n>\n> Two words.\n> — Daniel Kahneman, *Thinking, Fast and Slow* (2011), p. 42 · [[Books/Thinking, Fast and Slow.epub#OEBPS/ch03.xhtml|Thinking, Fast and Slow]]"
        );
        expect(formatCitation("markdown", { fields: kahneman(), link: citeLink(BOOK, "Thinking, Fast and Slow") })).toBe(
            "— Daniel Kahneman, *Thinking, Fast and Slow* (2011) · [[Books/Thinking, Fast and Slow.epub|Thinking, Fast and Slow]]"
        );
    });

    it("Inline: one, two and four authors, a page and a chapter, n.d. and the title for the missing", () => {
        expect(formatCitation("inline", full({ page: "42" }))).toBe("(Kahneman, 2011, p. 42)");
        expect(formatCitation("inline", full({ chapter: "3 · The lazy controller" }))).toBe("(Kahneman, 2011, ch. 3)");
        const two = citationFields({ kind: "paper", fileTitle: "x", details: { title: "Prospect theory", author: ["Kahneman, Daniel", "Tversky, Amos"], year: 1979 } });
        expect(formatCitation("inline", { fields: two, place: { page: "263" } })).toBe("(Kahneman & Tversky, 1979, p. 263)");
        const four = citationFields({ kind: "paper", fileTitle: "x", details: { author: ["Ann Lee", "Bo Ray", "Cy Day", "Di Fox"], year: 2020 } });
        expect(formatCitation("inline", { fields: four, place: { page: "7" } })).toBe("(Lee et al., 2020, p. 7)");
        const noYear = citationFields({ kind: "paper", fileTitle: "x", details: { author: ["Bent Flyvbjerg"] } });
        expect(formatCitation("inline", { fields: noYear, place: { page: "6" } })).toBe("(Flyvbjerg, n.d., p. 6)");
        const nothing = citationFields({ kind: "paper", fileTitle: "Reference class forecasting" });
        expect(formatCitation("inline", { fields: nothing, place: { page: "6" } })).toBe("(Reference class forecasting, n.d., p. 6)");
        expect(formatCitation("markdown", { fields: four, place: { page: "7" }, passage: "x" })).toContain("> — Ann Lee et al., *x* (2020), p. 7");
        expect(formatCitation("markdown", { fields: two, passage: "x" })).toContain("> — Daniel Kahneman & Amos Tversky, *Prospect theory* (1979)");
    });

    it("Citation key: Pandoc's form, with the place when there is one", () => {
        expect(formatCitation("key", full({ page: "42" }))).toBe("[@kahneman2011thinking, p. 42]");
        expect(formatCitation("key", full({ chapter: "3 · The lazy controller" }))).toBe("[@kahneman2011thinking, ch. 3]");
        expect(formatCitation("key", { fields: kahneman() })).toBe("[@kahneman2011thinking]");
    });

    it("BibTeX: @book, @article and @online, with only what is known", () => {
        expect(formatCitation("bibtex", full({ page: "42" }))).toBe(
            [
                "@book{kahneman2011thinking,",
                "  author = {Kahneman, Daniel},",
                "  title = {Thinking, Fast and Slow},",
                "  year = {2011},",
                "  publisher = {Farrar, Straus and Giroux},",
                "  isbn = {9780374275631},",
                "  language = {en}",
                "}",
            ].join("\n")
        );
        const paper = citationFields({ kind: "paper", fileTitle: "x", details: { title: "Prospect theory", author: ["Kahneman, Daniel", "Tversky, Amos"] } });
        expect(formatCitation("bibtex", { fields: paper, place: { page: "263" } })).toBe(
            ["@article{kahnemanprospect,", "  author = {Kahneman, Daniel and Tversky, Amos},", "  title = {Prospect theory}", "}"].join("\n")
        );
        const web = citationFields({ kind: "article", fileTitle: "x", details: { title: "The web we lost", author: ["Anil Dash"], year: 2012 }, url: "https://example.com/a_b", created: new Date(2025, 2, 2).getTime() });
        expect(formatCitation("bibtex", { fields: web })).toBe(
            [
                "@online{dash2012web,",
                "  author = {Dash, Anil},",
                "  title = {The web we lost},",
                "  year = {2012},",
                "  url = {https://example.com/a_b},",
                "  urldate = {2025-03-02}",
                "}",
            ].join("\n")
        );
    });

    it("BibTeX escapes { } & % $ # _ (AC-2)", () => {
        expect(bibEscape("R&D {50%} $5 #1 a_b")).toBe("R\\&D \\{50\\%\\} \\$5 \\#1 a\\_b");
        const odd = citationFields({ kind: "paper", fileTitle: "x", details: { title: "Cost & {risk} 100% $ #1 my_file" } });
        expect(formatCitation("bibtex", { fields: odd })).toContain("  title = {Cost \\& \\{risk\\} 100\\% \\$ \\#1 my\\_file}");
    });

    it("CSL JSON: book, article or webpage, issued, family and given names, the page when cited (AC-2)", () => {
        const text = formatCitation("csl", full({ page: "42" }));
        expect(JSON.parse(text)).toEqual([
            {
                id: "kahneman2011thinking",
                type: "book",
                title: "Thinking, Fast and Slow",
                author: [{ family: "Kahneman", given: "Daniel" }],
                issued: { "date-parts": [[2011]] },
                publisher: "Farrar, Straus and Giroux",
                ISBN: "9780374275631",
                language: "en",
                page: "42",
            },
        ]);
        expect(JSON.parse(formatCitation("csl", full({ chapter: "3 · The lazy controller" })))[0]["chapter-number"]).toBe("3");
        const nothing = JSON.parse(formatCitation("csl", { fields: citationFields({ kind: "paper", fileTitle: "Reference class forecasting" }) }));
        expect(nothing).toEqual([{ id: "reference", type: "article", title: "Reference class forecasting" }]);
        const web = JSON.parse(formatCitation("csl", { fields: citationFields({ kind: "article", fileTitle: "x", url: "https://example.com", created: new Date(2025, 2, 2).getTime() }) }));
        expect(web[0]).toMatchObject({ type: "webpage", URL: "https://example.com", accessed: { "date-parts": [[2025, 3, 2]] } });
        for (const item of [...JSON.parse(text), ...nothing, ...web]) {
            for (const key of Object.keys(item)) expect({ key, known: (CSL_KEYS as readonly string[]).includes(key) }).toEqual({ key, known: true });
        }
    });
});

describe("what a form lacks is named, never filled (FR-4, AC-4)", () => {
    it("names the author and the year a form needs, and BibTeX a book's publisher", () => {
        expect(missingFor("inline", kahneman())).toEqual([]);
        const noYear = citationFields({ kind: "paper", fileTitle: "x", details: { author: ["Bent Flyvbjerg"] } });
        expect(missingFor("inline", noYear)).toEqual(["year"]);
        expect(formatCitation("bibtex", { fields: noYear })).not.toContain("year");
        const nothing = citationFields({ kind: "paper", fileTitle: "Reference class forecasting" });
        expect(missingFor("markdown", nothing)).toEqual(["author", "year"]);
        const book = citationFields({ kind: "book", fileTitle: "x", details: { author: ["A B"], year: 2000 } });
        expect(missingFor("bibtex", book)).toEqual(["publisher"]);
        expect(missingFor("inline", book)).toEqual([]);
        expect(missingFor("key", { ...nothing, citekey: "mine" })).toEqual([]);
    });

    it("remembers a form, Markdown when unknown", () => {
        expect(citeFormOf("bibtex")).toBe("bibtex");
        expect(citeFormOf("apa")).toBe("markdown");
        expect(citeFormOf(undefined)).toBe("markdown");
    });
});
