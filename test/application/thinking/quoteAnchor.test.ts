import { describe, it, expect } from "@jest/globals";
import { anchorAll, anchorQuote, continuesSpan, quoteAt, type TextQuote } from "application/thinking/quoteAnchor";

const TEXT =
    "Event sourcing stores changes, not state. The balance is what the events add up to. " +
    "Later, a second note says the balance is what the events add up to, again.";

describe("quoteAt: the words you marked, with their context (#671)", () => {
    it("keeps the exact words and up to 32 characters either side", () => {
        const start = TEXT.indexOf("The balance");
        const end = start + "The balance is what the events add up to.".length;
        const made = quoteAt(TEXT, start, end)!;
        expect(made.quote.exact).toBe("The balance is what the events add up to.");
        expect(made.quote.prefix).toBe(TEXT.slice(start - 32, start));
        expect(made.quote.suffix).toBe(TEXT.slice(end, end + 32));
        expect(made.span).toEqual({ start, end });
    });

    it("trims the whitespace a double-click drags in, and says where the trimmed words are", () => {
        const start = TEXT.indexOf(" stores");
        const made = quoteAt(TEXT, start, start + " stores ".length)!;
        expect(made.quote.exact).toBe("stores");
        expect(made.span.start).toBe(start + 1);
    });

    it("has no quote for an empty or all-space selection", () => {
        expect(quoteAt(TEXT, 5, 5)).toBeNull();
        expect(quoteAt("a   b", 1, 4)).toBeNull();
    });

    it("clamps a selection that runs past the text", () => {
        expect(quoteAt("short", -3, 99)!.quote.exact).toBe("short");
    });
});

describe("anchorQuote: finding it again without a marker in the note (#671)", () => {
    it("finds the words where they were", () => {
        const start = TEXT.indexOf("stores changes");
        const quote = quoteAt(TEXT, start, start + "stores changes".length)!.quote;
        expect(anchorQuote(TEXT, quote)).toEqual({ start, end: start + "stores changes".length });
    });

    it("tells two identical sentences apart by what surrounds them", () => {
        const second = TEXT.lastIndexOf("the balance is what the events add up to");
        const quote = quoteAt(TEXT, second, second + "the balance is what the events add up to".length)!.quote;
        // The first occurrence starts with a capital T, so search for the lower-case one's twin.
        const span = anchorQuote(TEXT, quote)!;
        expect(span.start).toBe(second);
    });

    it("prefers the occurrence whose context still matches, even when it comes later", () => {
        const text = "alpha beta gamma. delta beta epsilon.";
        const quote: TextQuote = { exact: "beta", prefix: "delta ", suffix: " epsilon" };
        expect(anchorQuote(text, quote)).toEqual({ start: text.lastIndexOf("beta"), end: text.lastIndexOf("beta") + 4 });
    });

    it("takes the first occurrence on a tie", () => {
        const text = "beta x beta";
        expect(anchorQuote(text, { exact: "beta", prefix: "", suffix: "" })).toEqual({ start: 0, end: 4 });
    });

    it("forgives whitespace: re-wrapped lines and doubled spaces still anchor", () => {
        const today = "The balance is\nwhat   the events\n\nadd up to.";
        const quote: TextQuote = { exact: "balance is what the events add up", prefix: "The ", suffix: " to." };
        const span = anchorQuote(today, quote)!;
        expect(today.slice(span.start, span.end)).toBe("balance is\nwhat   the events\n\nadd up");
    });

    it("forgives whitespace inside the remembered quote too", () => {
        const quote: TextQuote = { exact: "stores   changes,\nnot", prefix: "", suffix: "" };
        const span = anchorQuote(TEXT, quote)!;
        expect(TEXT.slice(span.start, span.end)).toBe("stores changes, not");
    });

    it("does not guess at a reworded passage: it is detached", () => {
        expect(anchorQuote(TEXT, { exact: "stores deltas, not state", prefix: "", suffix: "" })).toBeNull();
    });

    it("never anchors an empty quote", () => {
        expect(anchorQuote(TEXT, { exact: "   ", prefix: "", suffix: "" })).toBeNull();
    });
});

describe("anchorAll: every highlight is drawn or listed, none dropped (#671)", () => {
    it("splits highlights into anchored (with their span) and detached", () => {
        const items = [
            { id: "1", quote: { exact: "stores changes", prefix: "", suffix: "" } },
            { id: "2", quote: { exact: "not in this note", prefix: "", suffix: "" } },
        ];
        const { anchored, detached } = anchorAll(TEXT, items);
        expect(anchored.map((a) => a.id)).toEqual(["1"]);
        expect(anchored[0].span.start).toBe(TEXT.indexOf("stores changes"));
        expect(detached.map((d) => d.id)).toEqual(["2"]);
    });
});

describe("continuesSpan: one passage marked in several goes (#868 FR-5)", () => {
    const first = { start: 0, end: TEXT.indexOf(", not") }; // "Event sourcing stores changes"

    it("continues across nothing but whitespace and punctuation, either way round", () => {
        const next = { start: TEXT.indexOf("not state"), end: TEXT.indexOf(" The balance") };
        expect(continuesSpan(first, next, TEXT)).toBe(true);
        expect(continuesSpan(next, first, TEXT)).toBe(true);
        const sentence = { start: TEXT.indexOf("The balance"), end: TEXT.indexOf(" Later") };
        expect(continuesSpan({ start: 0, end: TEXT.indexOf(" The") - 1 }, sentence, TEXT)).toBe(true);
    });

    it("continues what it overlaps", () => {
        expect(continuesSpan(first, { start: 6, end: 45 }, TEXT)).toBe(true);
    });

    it("does not continue across a word, or a long run of punctuation", () => {
        expect(continuesSpan(first, { start: TEXT.indexOf("state"), end: TEXT.indexOf(" The") }, TEXT)).toBe(false);
        expect(continuesSpan({ start: 0, end: 2 }, { start: 11, end: 13 }, "ab.........cd")).toBe(false);
    });
});

describe("continuesSpan at a line's end: the words a stroke stopped short of (#887 AC-2)", () => {
    // One paragraph wrapped on three lines; each number is where a line starts.
    const text = "the first line ends here and the second line goes on until the third";
    const lineStarts = [0, text.indexOf("and"), text.indexOf("until")];
    const at = (from: string, to: string) => ({ start: text.indexOf(from), end: text.indexOf(to) + to.length });

    it("takes in the words left at the end of one line and the start of the next", () => {
        // "ends here" left out at the end of line one, "and the" at the start of line two.
        expect(continuesSpan(at("the first", "line"), at("second", "on"), text, lineStarts)).toBe(true);
        // Either way round.
        expect(continuesSpan(at("second", "on"), at("the first", "line"), text, lineStarts)).toBe(true);
    });

    it("still splits on a word skipped mid-line, a whole line skipped, or no lines given", () => {
        expect(continuesSpan(at("the first", "first"), at("ends", "here"), text, lineStarts)).toBe(false);
        expect(continuesSpan(at("the first", "here"), at("the third", "third"), text, lineStarts)).toBe(false);
        expect(continuesSpan(at("the first", "line"), at("second", "on"), text)).toBe(false);
    });

    it("still splits across a paragraph, words between", () => {
        const two = "the first paragraph ends here\n\nthe second begins";
        const starts = [0, two.indexOf("the second")];
        expect(continuesSpan({ start: 0, end: 19 }, { start: two.indexOf("second"), end: two.length }, two, starts)).toBe(false);
    });
});
