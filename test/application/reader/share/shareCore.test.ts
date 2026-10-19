import { describe, it, expect } from "@jest/globals";
import { pageWordsOf, type PdfWordItem } from "application/library/pdfWords";
import { quoteAt } from "application/thinking/quoteAnchor";
import type { Thought } from "application/thinking/thought";
import { SHARE_COLOURS, classifyMarks, highlightPayload, markedPages, placeHighlight, placeNotes, userSpaceGeometry, wrapNote } from "application/reader/share/shareMarks";
import { checkCopy, fillFor, fillHoles, freeCopyPath, holeFor, indexOfBytes, startsWith, utf16Hex } from "application/reader/share/shareFill";

/** What goes on a shared copy, and where (#842): pure, over pdf.js-shaped runs and bytes. */

const item = (str: string, x: number, y: number, size = 10): PdfWordItem => ({ str, transform: [size, 0, 0, size, x, y], width: str.length * size * 0.5, height: size });
const LINES = ["The first line of a passage that runs on to", "a second line, where the passage ends here."];

function thought(over: Partial<Thought> = {}): Thought {
    return { id: "t", at: 1, text: "", links: [], about: "Papers/p.pdf", locator: { at: 0, label: "p. 1" }, ...over } as Thought;
}

function highlightOver(view: [number, number, number, number], items: PdfWordItem[], from: string, to: string) {
    const page = pageWordsOf(items, userSpaceGeometry(view));
    const quote = quoteAt(page.text, page.text.indexOf(from), page.text.indexOf(to) + to.length)!.quote;
    return { page, made: thought({ quote }) };
}

describe("a highlight on its printed page (#842 FR-1, AC-1)", () => {
    const items = LINES.map((line, i) => item(line, 72, 700 - i * 12));

    it("gives one quad per line, each over that line's words, in the page's own space", () => {
        const view: [number, number, number, number] = [0, 0, 612, 792];
        const { page, made } = highlightOver(view, items, "passage that", "second line,");
        const lines = placeHighlight(page, view, made)!;
        expect(lines).toHaveLength(2);
        const [first, second] = lines;
        // `TL TR BL BR`: the first line's words from "passage" (character 20) to its end.
        expect(first.quad[0]).toBeCloseTo(72 + 20 * 5, 1);
        expect(first.quad[1]).toBeGreaterThan(first.quad[5]);
        expect(second.quad[0]).toBeCloseTo(72, 1);
        expect(second.quad[1]).toBeLessThan(first.quad[5] + 1);
        expect(first.outline).toEqual([first.quad[0], first.quad[1], first.quad[2], first.quad[1], first.quad[2], first.quad[5], first.quad[0], first.quad[5]]);
    });

    it("lands where the words are on a page whose box does not start at 0 (an offset MediaBox)", () => {
        const view: [number, number, number, number] = [36, 36, 648, 828];
        const { page, made } = highlightOver(view, items, "The first", "line");
        const [line] = placeHighlight(page, view, made)!;
        expect(line.quad[0]).toBeCloseTo(72, 1);
        expect(line.quad[5]).toBeLessThan(700);
        expect(line.quad[1]).toBeGreaterThan(700);
    });

    it("cannot place a passage that is not on the page, nor one on a page with no words", () => {
        const view: [number, number, number, number] = [0, 0, 612, 792];
        const page = pageWordsOf(items, userSpaceGeometry(view));
        expect(placeHighlight(page, view, thought({ quote: { exact: "words that are nowhere", prefix: "", suffix: "" } }))).toBeNull();
        const blank = pageWordsOf([item("12", 300, 40)], userSpaceGeometry(view));
        expect(placeHighlight(blank, view, thought({ quote: { exact: "12", prefix: "", suffix: "" } }))).toBeNull();
    });
});

describe("what goes on the copy (#842 FR-2, FR-5)", () => {
    it("colours each meaning its own fixed colour, an old highlight as an idea", () => {
        const lines = [{ quad: [0, 10, 5, 10, 0, 0, 5, 0], outline: [0, 10, 5, 10, 5, 0, 0, 0] }];
        expect(highlightPayload(lines, 0, thought({ meaning: "question" })).color).toEqual(SHARE_COLOURS.question);
        expect(highlightPayload(lines, 0, thought()).color).toEqual(SHARE_COLOURS.idea);
        expect(highlightPayload(lines, 2, thought(), "zf0ZZ")).toMatchObject({ annotationType: 9, pageIndex: 2, user: "zf0ZZ", rect: [0, 0, 5, 10] });
    });

    it("keeps the yellow, blue, green and purple apart: each meaning stays in its own hue", () => {
        const hue = ([r, g, b]: number[]) => {
            const [x, y, z] = [r / 255, g / 255, b / 255];
            const max = Math.max(x, y, z);
            const d = max - Math.min(x, y, z);
            const h = max === x ? ((y - z) / d) % 6 : max === y ? (z - x) / d + 2 : (x - y) / d + 4;
            return (h * 60 + 360) % 360;
        };
        expect(hue(SHARE_COLOURS.idea)).toBeGreaterThan(45);
        expect(hue(SHARE_COLOURS.idea)).toBeLessThan(70);
        expect(hue(SHARE_COLOURS.question)).toBeGreaterThan(180);
        expect(hue(SHARE_COLOURS.question)).toBeLessThan(230);
        expect(hue(SHARE_COLOURS.quote)).toBeGreaterThan(140);
        expect(hue(SHARE_COLOURS.quote)).toBeLessThan(175);
        expect(hue(SHARE_COLOURS.discuss)).toBeGreaterThan(250);
        expect(hue(SHARE_COLOURS.discuss)).toBeLessThan(290);
    });

    it("takes highlights and margin notes; an ink note, an accepted move, a thought with no place, never", () => {
        const quote = { exact: "a passage", prefix: "", suffix: "" };
        const marks = classifyMarks([
            thought({ id: "h", quote }),
            thought({ id: "n", text: "A note on a page with no text." }),
            thought({ id: "empty" }),
            thought({ id: "ink", ink: { drawing: "x.svg" } } as Partial<Thought>),
            thought({ id: "move", quote, madeBy: { kind: "ai" } } as Partial<Thought>),
            thought({ id: "nowhere", quote, locator: undefined }),
        ]);
        expect(marks.highlights.map((each) => each.id)).toEqual(["h"]);
        expect(marks.notes.map((each) => each.id)).toEqual(["n"]);
        expect(markedPages({ highlights: [thought({ locator: { at: 4, label: "" } })], notes: [thought({ locator: { at: 1, label: "" } }), thought({ locator: { at: 4, label: "" } })] })).toEqual([1, 4]);
    });
});

describe("a margin note (#842 FR-4, AC-4)", () => {
    const view: [number, number, number, number] = [0, 0, 612, 792];
    const words = pageWordsOf(LINES.map((line, i) => item(line, 72, 700 - i * 12)), userSpaceGeometry(view)).words;

    it("breaks a note into lines that fit, keeping its own breaks and every word whole", () => {
        const lines = wrapNote("A note that is a little too long for one line\nand its second paragraph", 100);
        expect(lines.every((line) => line.length <= 20)).toBe(true);
        expect(lines.join(" ")).toBe("A note that is a little too long for one line and its second paragraph");
        expect(wrapNote("Supercalifragilisticexpialidocious", 50).every((line) => line.length <= 10)).toBe(true);
    });

    it("goes down the wider margin from the top of the text, two notes never over each other", () => {
        const [one, two] = placeNotes(view, words, ["The first note.", "The second note, below it."]);
        // The text runs from 72 to ~292: the right margin is the wider, and the notes sit in it.
        expect(one.rect[0]).toBeGreaterThan(292);
        expect(one.rect[2]).toBeLessThanOrEqual(612);
        expect(two.rect[3]).toBeLessThanOrEqual(one.rect[1]);
    });

    it("takes the top-right corner over a page with no words, inside the page", () => {
        const [note] = placeNotes(view, [], ["A note on a scanned page."]);
        expect(note.rect[2]).toBeLessThanOrEqual(612);
        expect(note.rect[3]).toBeLessThanOrEqual(792);
        expect(note.rect[0]).toBeGreaterThanOrEqual(0);
        expect(note.rect[1]).toBeGreaterThan(700);
    });
});

describe("a comment that rides on its highlight (#842 FR-3, AC-3)", () => {
    const ascii = (text: string) => Uint8Array.from(text, (ch) => ch.charCodeAt(0));

    it("writes any text as UTF-16BE hex, a surrogate pair as its two units", () => {
        expect(utf16Hex("¿ñ")).toBe("<FEFF00BF00F1>");
        expect(utf16Hex("😀")).toBe("<FEFFD83DDE00>");
        expect(fillFor("hi", "")).toBe("/Contents <FEFF00680069>");
        expect(fillFor("", "Rafa")).toBe("/T <FEFF0052006100660061>");
    });

    it("reserves a hole exactly as long as its fill, and none for a mark with nothing to carry", () => {
        const hole = holeFor(3, "Revisa esto", "Rafa")!;
        expect(`/T (${hole.user})`.length).toBe(hole.fill.length);
        expect(hole.user.startsWith("zf3")).toBe(true);
        expect(holeFor(0, "", "")).toBeNull();
        const tiny = holeFor(12, "a", "")!;
        expect(`/T (${tiny.user})`.length).toBe(tiny.fill.length);
    });

    it("fills a hole in place: same length, every byte outside it untouched", () => {
        const hole = holeFor(0, "¿Por qué?", "Rafa")!;
        const saved = ascii(`%PDF original bytes|10 0 obj << /T (${hole.user}) /AP 13 0 R >> endobj`);
        const copy = saved.slice();
        expect(fillHoles(copy, [hole], 20)).toEqual([]);
        expect(copy.length).toBe(saved.length);
        const at = indexOfBytes(saved, ascii("/T ("));
        expect(copy.slice(0, at)).toEqual(saved.slice(0, at));
        expect(copy.slice(at + hole.fill.length)).toEqual(saved.slice(at + hole.fill.length));
        expect(Buffer.from(copy.slice(at, at + hole.fill.length)).toString("latin1").trim()).toBe(fillFor("¿Por qué?", "Rafa"));
    });

    it("reports a hole it cannot find, or finds twice, instead of guessing", () => {
        const hole = holeFor(0, "x", "")!;
        expect(fillHoles(ascii("nothing here"), [hole], 0)).toEqual([hole.user]);
        expect(fillHoles(ascii(`/T (${hole.user}) and /T (${hole.user})`), [hole], 0)).toEqual([hole.user]);
        // A hole inside the original's own bytes is never touched.
        expect(fillHoles(ascii(`/T (${hole.user}) original`), [hole], 5)).toEqual([hole.user]);
    });
});

describe("the check before anything is saved (#842 FR-11, AC-9)", () => {
    const original = Uint8Array.from([1, 2, 3]);
    const saved = Uint8Array.from([1, 2, 3, 4, 5]);
    const planned = [{ page: 0, subtype: "Highlight" as const, contents: "a note", author: "Rafa" }];
    const good = { saved, original, missing: [], planned, before: new Map([[0, 1]]), after: new Map([[0, [{ subtype: "Link", contents: "", title: "" }, { subtype: "Highlight", contents: "a note", title: "Rafa" }]]]) };

    it("passes a copy that reads back as written", () => {
        expect(checkCopy(good)).toBeNull();
        expect(startsWith(saved, original)).toBe(true);
    });

    it("names the first check a copy fails", () => {
        expect(checkCopy({ ...good, saved: Uint8Array.from([1, 9, 3, 4]) })).toBe("prefix");
        expect(checkCopy({ ...good, missing: ["zf0"] })).toBe("holes");
        expect(checkCopy({ ...good, before: new Map([[0, 0]]) })).toBe("count");
        expect(checkCopy({ ...good, after: new Map([[0, [{ subtype: "Link", contents: "", title: "" }, { subtype: "Highlight", contents: "a nota", title: "Rafa" }]]]) })).toBe("contents");
        expect(checkCopy({ ...good, after: new Map([[0, [{ subtype: "Link", contents: "", title: "" }, { subtype: "Highlight", contents: "a note", title: "" }]]]) })).toBe("author");
    });
});

describe("the copy's name (#842 FR-9, AC-8)", () => {
    it("goes beside the original, and never over a copy already there", () => {
        expect(freeCopyPath("Papers", "cap", "annotated", () => false)).toBe("Papers/cap (annotated).pdf");
        expect(freeCopyPath("Papers", "cap", "annotated", (p) => p === "Papers/cap (annotated).pdf")).toBe("Papers/cap (annotated) 2.pdf");
        expect(freeCopyPath("", "cap", "anotado", () => false)).toBe("cap (anotado).pdf");
    });
});
