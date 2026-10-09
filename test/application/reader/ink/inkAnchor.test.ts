import { describe, it, expect } from "@jest/globals";
import { anchorInk, keepOnPage, pageAnchor, placeInk, placePageInk, type Column, type WordBox } from "application/reader/ink/inkAnchor";
import { anchorQuote } from "application/thinking/quoteAnchor";

const TEXT = "The idea of a deep module is that its interface is much simpler than its implementation. A shallow module is the opposite.";

/**
 * The chapter's words laid out in lines of `perLine` words, `fontPx` type, in a column at `left`.
 * Every word is the same width here — what matters is that it moves when the text re-flows.
 */
function layout(fontPx: number, column: Column, perLine: number): { words: WordBox[]; linePx: number } {
    const linePx = fontPx * 1.75;
    const words: WordBox[] = [];
    let at = 0;
    TEXT.split(" ").forEach((word, i) => {
        const start = TEXT.indexOf(word, at);
        at = start + word.length;
        const line = Math.floor(i / perLine);
        const col = i % perLine;
        words.push({ start, end: start + word.length, left: column.left + (col * column.width) / perLine, top: 100 + line * linePx, width: column.width / perLine - 4, height: fontPx });
    });
    return { words, linePx };
}

const WIDE: Column = { left: 200, width: 34 * 16, outerLeft: 0, outerRight: 1000 };

describe("where ink is: the words it was written beside (#745 E2, AC-1, FR-11)", () => {
    // A margin note beside the line holding "interface", in the right margin, written at 16 px.
    const written = layout(16, WIDE, 8);
    const interfaceWord = written.words.find((w) => TEXT.slice(w.start, w.end) === "interface")!;
    const lineWords = written.words.filter((w) => w.top === interfaceWord.top);
    const lastOnLine = lineWords[lineWords.length - 1];
    const box = { left: WIDE.left + WIDE.width + 30, top: interfaceWord.top - 4, width: 80, height: 30 };
    const { anchor } = anchorInk({ box, first: { x: box.left, y: interfaceWord.top + 4 }, words: written.words, column: WIDE, fontPx: 16, linePx: written.linePx, text: TEXT });
    const anchoredText = TEXT.slice(lastOnLine.start, lastOnLine.end);

    it("anchors to the text-quote of the word nearest the first stroke, with its context", () => {
        expect(anchor.quote?.exact).toBe(anchoredText);
        expect(anchor.quote?.prefix.length).toBeGreaterThan(0);
        expect(anchor.side).toBe("right");
        expect(anchor.em).toBe(16);
        expect(anchorQuote(TEXT, anchor.quote!)).toEqual({ start: lastOnLine.start, end: lastOnLine.end });
    });

    it("keeps the same side, fraction and line at 20 px, a 24 em column and after a re-flow, scaled by the type", () => {
        const narrow: Column = { left: 160, width: 24 * 20, outerLeft: 0, outerRight: 800 };
        const now = layout(20, narrow, 5); // re-flowed: the word is on another line now
        const span = anchorQuote(TEXT, anchor.quote!)!;
        const word = now.words.find((w) => w.start === span.start)!;
        expect(word.top).not.toBe(lastOnLine.top);
        const placed = placeInk(anchor, word, narrow, 20, now.linePx);
        expect(placed.scale).toBe(20 / 16);
        expect(placed.unit).toBe(20);
        const right = narrow.left + narrow.width;
        expect((placed.left - right) / (narrow.outerRight - right)).toBeCloseTo(anchor.x, 3);
        expect((placed.top - word.top) / now.linePx).toBeCloseTo(anchor.line, 3);
        expect(placed.left).toBeGreaterThan(right);
    });

    it("keeps margin ink in its margin when the column narrows", () => {
        const left = { left: WIDE.left - 120, top: 120, width: 60, height: 20 };
        const { anchor: inLeft } = anchorInk({ box: left, first: { x: left.left, y: 124 }, words: written.words, column: WIDE, fontPx: 16, linePx: written.linePx, text: TEXT });
        expect(inLeft.side).toBe("left");
        const narrow: Column = { left: 80, width: 300, outerLeft: 0, outerRight: 460 };
        const placed = placeInk(inLeft, written.words[0], narrow, 16, written.linePx);
        expect(placed.left).toBeGreaterThanOrEqual(narrow.outerLeft);
        expect(placed.left).toBeLessThan(narrow.left);
    });
});

describe("ink on a fixed page (#745 E2, AC-2)", () => {
    const page = { left: 40, top: 60, width: 600, height: 800 };
    const box = { left: 100, top: 160, width: 120, height: 40 };
    const anchor = pageAnchor(box, page);

    it("keeps fractions of the page box", () => {
        expect(anchor).toEqual({ px: 0.1, py: 0.125, pw: 0.2, ph: 0.05 });
    });

    it("lands on the same spot of the page zoomed in, and on a page cropped and moved", () => {
        const zoomed = { left: 80, top: 120, width: 1200, height: 1600 };
        expect(pageAnchor({ ...placePageInk(anchor, zoomed), width: 240, height: 80 }, zoomed)).toEqual(anchor);
        const cropped = { left: -300, top: 20, width: 600, height: 800 };
        const placed = placePageInk(anchor, cropped);
        expect(placed.left).toBe(-300 + 60);
        expect(placed.unit).toBe(600 / 40);
    });
});

describe("a note stays on the page when its margin narrows (#745 FR-11)", () => {
    it("moves in to fit, never out past the left edge", () => {
        const column: Column = { left: 20, width: 760, outerLeft: 0, outerRight: 800 };
        expect(keepOnPage(790, 60, column)).toBe(740);
        expect(keepOnPage(300, 60, column)).toBe(300);
        expect(keepOnPage(-40, 60, column)).toBe(0);
    });
});
