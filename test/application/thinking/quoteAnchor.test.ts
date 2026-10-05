import { describe, it, expect } from "@jest/globals";
import { anchorAll, anchorQuote, quoteAt, type TextQuote } from "application/thinking/quoteAnchor";

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
