import { describe, it, expect } from "@jest/globals";
import {
    boundQuote,
    chapterFromLabel,
    foldMarks,
    mergeSourceEntries,
    parsePassageLink,
    parsePlace,
    passageLink,
    placeOf,
    printPageAt,
    readSourceEntry,
    resolveChapter,
    samePlace,
    serializePlace,
    sourceEntry,
    PLACE_CHARS,
    PLACE_CONTEXT,
    type PassagePlace,
} from "application/library/provenance";
import { anchorQuote } from "application/thinking/quoteAnchor";
import { parseThought, renderThought, type Thought } from "application/thinking/thought";

const EPUB = "Books/Thinking, Fast and Slow.epub";
const quote = { exact: "A general law of least effort applies", prefix: "physical exertion. ", suffix: " to cognitive" };
const paged: PassagePlace = { file: EPUB, chapter: "OEBPS/ch03.xhtml", label: "3 · The lazy controller", page: "143", quote };
const unpaged: PassagePlace = { file: "Books/Dubliners.epub", chapter: "OEBPS/text/chapter-1.xhtml", label: "The Sisters", quote };
const pdf: PassagePlace = { file: "Papers/cap.pdf", chapter: "page:5", label: "p. 6", page: "6", quote: { exact: "Partitions are rare", prefix: "", suffix: " but" } };

describe("the place and its one written form (#751 P1, P2, AC-1)", () => {
    it("writes an EPUB passage with a print page as a readable citation, and reads it back", () => {
        const entry = sourceEntry(paged, "Thinking, Fast and Slow");
        expect(entry).toBe(
            "[[Books/Thinking, Fast and Slow.epub#OEBPS/ch03.xhtml|Thinking, Fast and Slow]] p. 143 · 3 · The lazy controller · “…physical exertion. ‹A general law of least effort applies› to cognitive…”"
        );
        expect(readSourceEntry(entry)).toEqual({ ...paged, title: "Thinking, Fast and Slow" });
    });

    it("writes no page for a book that declares none", () => {
        const entry = sourceEntry(unpaged);
        expect(entry).not.toMatch(/ p\. /);
        expect(entry.startsWith("[[Books/Dubliners.epub#OEBPS/text/chapter-1.xhtml|Dubliners]] · The Sisters · “")).toBe(true);
        expect(readSourceEntry(entry)).toEqual({ ...unpaged, title: "Dubliners" });
    });

    it("cites a PDF by Obsidian's own #page= deep link, its label left out", () => {
        const entry = sourceEntry(pdf, "CAP twelve years later");
        expect(entry).toBe("[[Papers/cap.pdf#page=6|CAP twelve years later]] p. 6 · “‹Partitions are rare› but…”");
        expect(readSourceEntry(entry)).toEqual({ ...pdf, title: "CAP twelve years later" });
    });

    it("folds the form's own marks in the book's text, and encodes them in a spine href — both survive", () => {
        const odd: PassagePlace = {
            file: "Books/odd.epub",
            chapter: "OEBPS/a|b]#c d%.xhtml",
            label: "On [brackets] | pipes",
            quote: { exact: "a ‹quoted› [word] | “here”", prefix: "x] ", suffix: " |y" },
        };
        const entry = sourceEntry(odd);
        expect(entry).toContain("#OEBPS/a%7Cb%5D%23c d%25.xhtml|");
        const back = readSourceEntry(entry)!;
        expect(back.chapter).toBe(odd.chapter);
        expect(back.label).toBe("On (brackets) / pipes");
        expect(back.quote).toEqual({ exact: foldMarks(odd.quote!.exact), prefix: "x) ", suffix: " /y" });
        // Folding is one for one: an offset in the folded text is an offset in the text.
        const text = `lead x] ${odd.quote!.exact} |y tail`;
        expect(anchorQuote(foldMarks(text), back.quote!)).toEqual({ start: 8, end: 8 + odd.quote!.exact.length });
    });

    it("reads a 3.6 citation as a place with no chapter and no quote", () => {
        expect(readSourceEntry("[[Books/tfs.epub]] 3 · The lazy controller")).toEqual({ file: "Books/tfs.epub", label: "3 · The lazy controller" });
        expect(readSourceEntry("[[Papers/cap.pdf]] p. 42")).toEqual({ file: "Papers/cap.pdf", label: "p. 42", page: "42" });
    });

    it("ignores what it cannot read, and never throws", () => {
        for (const value of ["[[x.epub]]", "[[x.epub#ch.xhtml]] · “…‹no end”", "[[Notes/other]] p. 3", "plain text", 42, null, undefined, {}]) {
            expect(() => readSourceEntry(value)).not.toThrow();
        }
        expect(readSourceEntry("[[x.epub]]")).toEqual({ file: "x.epub", label: "" });
        expect(readSourceEntry("[[x.epub#ch.xhtml]] · “…‹no end”")?.quote).toBeUndefined();
        expect(readSourceEntry("[[Notes/other]] p. 3")).toBeNull();
        expect(readSourceEntry(42)).toBeNull();
        expect(readSourceEntry(null)).toBeNull();
    });

    it("bounds a long passage to its opening words, on a word boundary, with its own rest as the suffix", () => {
        const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
        const bounded = boundQuote({ exact: long, prefix: "a long run of text before the passage starts ", suffix: " after" });
        expect(bounded.exact.split(" ")).toHaveLength(12);
        expect(bounded.exact.length).toBeLessThanOrEqual(PLACE_CHARS);
        expect(bounded.exact.startsWith("word0 word1")).toBe(true);
        expect(bounded.suffix.length).toBeLessThanOrEqual(PLACE_CONTEXT);
        expect(bounded.suffix.startsWith(" word12")).toBe(true);
        expect(bounded.prefix.length).toBeLessThanOrEqual(PLACE_CONTEXT);
        expect(bounded.prefix).toBe("the passage starts ");
        // A run of long words stops at 90 characters, still on a boundary.
        const wide = boundQuote({ exact: Array.from({ length: 10 }, () => "x".repeat(20)).join(" "), prefix: "", suffix: "" });
        expect(wide.exact.length).toBeLessThanOrEqual(PLACE_CHARS);
        expect(wide.exact.endsWith("x")).toBe(true);
        // Still found again in the text it came from.
        const text = `a long run of text before the passage starts ${long} after`;
        expect(anchorQuote(text, bounded)?.start).toBe(text.indexOf("word0"));
    });

    it("tells the same passage apart from another", () => {
        expect(samePlace(paged, { ...paged, label: "x", quote: { ...quote, exact: "A  general law of least effort applies" } })).toBe(true);
        expect(samePlace(paged, { ...paged, chapter: "OEBPS/ch04.xhtml" })).toBe(false);
        expect(samePlace(paged, { ...paged, quote: { ...quote, exact: "Another" } })).toBe(false);
    });

    it("builds the place from a highlight, and a highlight round-trips its chapter and page (FR-5)", () => {
        const thought: Thought = {
            id: "h1",
            at: 1,
            text: "",
            links: [],
            about: EPUB,
            quote: { exact: "A general law of least effort applies to cognitive as well as physical exertion.", prefix: "x", suffix: "y" },
            locator: { at: 6, label: "3 · The lazy controller", chapter: "OEBPS/ch03.xhtml", page: "143" },
        };
        expect(placeOf(thought)).toMatchObject({ file: EPUB, chapter: "OEBPS/ch03.xhtml", label: "3 · The lazy controller", page: "143", quote: { exact: "A general law of least effort applies to cognitive as well as" } });
        const again = parseThought(renderThought(thought), "Lab/h1.md");
        expect(again.locator).toEqual(thought.locator);
        // A 3.6 thought reads exactly as before.
        const old = parseThought(renderThought({ ...thought, locator: { at: 6, label: "3 · The lazy controller" } }), "Lab/h1.md");
        expect(old.locator).toEqual({ at: 6, label: "3 · The lazy controller" });
        // A PDF highlight made before #751 still knows its page index.
        expect(placeOf({ ...thought, about: "Papers/cap.pdf", locator: { at: 5, label: "p. 6" } })?.chapter).toBe("page:5");
        expect(placeOf({ ...thought, about: "Notes/a.md" })).toBeNull();
    });
});

describe("print pages are read, never invented (#751 FR-3)", () => {
    it("gives the last mark at or before the passage", () => {
        const marks = [
            { label: "12", offset: 0 },
            { label: "13", offset: 400 },
        ];
        expect(printPageAt(marks, 10)).toBe("12");
        expect(printPageAt(marks, 400)).toBe("13");
        expect(printPageAt(marks, 900)).toBe("13");
        expect(printPageAt([{ label: "13", offset: 400 }], 10)).toBeUndefined();
        expect(printPageAt([], 10)).toBeUndefined();
        expect(printPageAt(undefined, 10)).toBeUndefined();
    });
});

describe("finding the chapter and the passage again (#751 AC-4, G1)", () => {
    const chapters = [
        { label: "Cover", key: "OEBPS/cover.xhtml" },
        { label: "Contents", key: "OEBPS/toc.xhtml" },
        { label: "1 · The characters", key: "OEBPS/ch01.xhtml" },
        { label: "2 · Attention", key: "OEBPS/ch02.xhtml" },
        { label: "3 · The lazy controller", key: "OEBPS/ch03.xhtml" },
    ];

    it("finds a chapter by its key even when the spine order has changed", () => {
        const shuffled = [chapters[4], chapters[0], chapters[3], chapters[2], chapters[1]];
        expect(resolveChapter(paged, shuffled)).toBe(0);
        expect(resolveChapter(paged, chapters)).toBe(4);
    });

    it("lands an old citation by the label the book gave the chapter, never by its number as an index", () => {
        const old: PassagePlace = { file: EPUB, label: "3 · The lazy controller" };
        expect(resolveChapter(old, chapters)).toBe(4);
        expect(resolveChapter(old, chapters)).not.toBe(2);
        // The title alone, and the number alone, as the book labels it.
        expect(chapterFromLabel("The lazy controller", chapters)).toBe(4);
        expect(chapterFromLabel("3 · The [lazy] controller", chapters)).toBe(4);
        expect(chapterFromLabel("3 · Renamed since", chapters)).toBe(4);
        expect(chapterFromLabel("9 · Nowhere", chapters)).toBeNull();
    });

    it("falls back to the page", () => {
        const pages = [{ label: "p. i", key: "page:0", page: "i" }, { label: "p. 1", key: "page:1", page: "1" }, { label: "p. 2", key: "page:2", page: "2" }];
        expect(resolveChapter({ file: "a.pdf", label: "", page: "2" }, pages)).toBe(2);
        expect(resolveChapter({ file: "a.pdf", label: "", page: "i" }, pages)).toBe(0);
        expect(resolveChapter({ file: "a.epub", label: "Gone" }, chapters)).toBeNull();
    });

    it("changed words resolve to the chapter only — never to a neighbouring paragraph", () => {
        const text = "First paragraph about attention. A general law of most effort applies to cognitive work. Third.";
        expect(anchorQuote(foldMarks(text), paged.quote!)).toBeNull();
        // The same words a paragraph later are found, only where they are.
        const moved = `Something else entirely. physical exertion. ${quote.exact} to cognitive`;
        expect(anchorQuote(foldMarks(moved), paged.quote!)?.start).toBe(moved.indexOf("A general"));
    });
});

describe("a place in the Reader's state, and a link to it (#751 FR-8, AC-7)", () => {
    it("round-trips through the view state", () => {
        expect(parsePlace(serializePlace(paged))).toEqual(paged);
        expect(parsePlace(serializePlace({ file: EPUB, label: "3 · The lazy controller" }))).toEqual({ file: EPUB, label: "3 · The lazy controller" });
        expect(parsePlace("file=Notes%2Fa.md")).toBeNull();
        expect(parsePlace(42)).toBeNull();
        expect(parsePlace("file=a.epub&file=b.epub")).toBeNull();
    });

    it("writes the obsidian:// link with the path and the anchor's few words, and reads it back", () => {
        const link = passageLink(paged, "My vault");
        expect(link.startsWith("obsidian://zettelflow-read?vault=My%20vault&file=Books%2FThinking%2C%20Fast%20and%20Slow.epub&chapter=OEBPS%2Fch03.xhtml")).toBe(true);
        expect(link).not.toContain("label=");
        const params: Record<string, string> = { action: "zettelflow-read" };
        for (const pair of link.split("?")[1].split("&")) {
            const [k, v] = pair.split("=");
            params[k] = decodeURIComponent(v);
        }
        expect(parsePassageLink(params)).toEqual({ file: paged.file, chapter: paged.chapter, label: "", page: "143", quote });
    });

    it("opens nothing for a foreign file, an over-long value, a missing field or an unknown one", () => {
        const ok = { action: "zettelflow-read", vault: "v", file: "a.epub", chapter: "c.xhtml", q: "words" };
        expect(parsePassageLink(ok)).not.toBeNull();
        expect(parsePassageLink({ ...ok, file: "Notes/a.md" })).toBeNull();
        expect(parsePassageLink({ ...ok, q: "x".repeat(PLACE_CHARS + 1) })).toBeNull();
        expect(parsePassageLink({ ...ok, pre: "x".repeat(PLACE_CONTEXT + 1) })).toBeNull();
        const { file: _file, ...noFile } = ok;
        expect(parsePassageLink(noFile)).toBeNull();
        const { q: _q, ...noQuote } = ok;
        expect(parsePassageLink(noQuote)).toBeNull();
        expect(parsePassageLink({ ...ok, script: "x" })).toBeNull();
    });
});

describe("the one property writer's merge (#751 P7)", () => {
    const entry = sourceEntry(paged);
    it("turns a scalar into a list and appends, once", () => {
        expect(mergeSourceEntries("[[Other.epub]] p. 1", [entry])).toEqual(["[[Other.epub]] p. 1", entry]);
        expect(mergeSourceEntries(undefined, [entry])).toEqual([entry]);
        expect(mergeSourceEntries([entry], [entry])).toBeNull();
        // The same passage, written a little differently (another alias): not added again.
        expect(mergeSourceEntries([sourceEntry(paged, "Another title")], [entry])).toBeNull();
        expect(mergeSourceEntries(entry, [entry])).toBeNull();
        // A template's own value stays, whatever it is.
        expect(mergeSourceEntries(["https://example.org", 3], [entry])).toEqual(["https://example.org", 3, entry]);
    });
});
