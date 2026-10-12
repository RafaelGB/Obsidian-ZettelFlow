import { describe, it, expect } from "@jest/globals";
import { bandWords, extendsHighlight, strokeMetrics, EXTEND_WINDOW_MS, LINE_BAND_LH } from "application/reader/ink/strokeHighlight";
import type { WordBox } from "application/reader/ink/inkAnchor";

describe("a highlighter stroke, measured (#746)", () => {
    it("has its band and its window as named constants", () => {
        expect({ LINE_BAND_LH, EXTEND_WINDOW_MS }).toEqual({ LINE_BAND_LH: 0.75, EXTEND_WINDOW_MS: 4000 });
    });

    it("measures direction, closure and the turns back", () => {
        const ltr = strokeMetrics([{ x: 0, y: 0 }, { x: 50, y: 1 }, { x: 100, y: 0 }]);
        expect(ltr.direction).toBe("ltr");
        expect(ltr.closure).toBeCloseTo(0, 2);
        expect(ltr.straightness).toBeGreaterThan(0.99);
        expect(ltr.reversals).toBe(0);
        expect(strokeMetrics([{ x: 100, y: 0 }, { x: 0, y: 0 }]).direction).toBe("rtl");
        const zigzag = strokeMetrics([0, 20, 5, 25, 10, 30].map((x, i) => ({ x, y: i })), 2);
        expect(zigzag.reversals).toBe(4);
        const loop = strokeMetrics(Array.from({ length: 41 }, (_, i) => ({ x: 30 * Math.cos((i / 40) * Math.PI * 2), y: 10 * Math.sin((i / 40) * Math.PI * 2) })));
        expect(loop.closure).toBeGreaterThan(0.9);
    });
});

/** Three lines of words, 16 px type on a 28 px line: "alpha beta gamma delta" on each, offsets running on. */
function page(): WordBox[] {
    const words: WordBox[] = [];
    let at = 0;
    for (let line = 0; line < 3; line++) {
        let x = 100;
        for (const word of ["alpha", "beta", "gamma", "delta"]) {
            const width = word.length * 8;
            words.push({ start: at, end: at + word.length, left: x, top: 100 + line * 28 + 6, width, height: 16 });
            at += word.length + 1;
            x += width + 6;
        }
    }
    return words;
}
const MIDDLE = (line: number) => 100 + line * 28 + 14;
const stroke = (y: number, from = 90, to = 400) => [
    { x: from, y },
    { x: (from + to) / 2, y: y + 1 },
    { x: to, y },
];

describe("the words it covers (#746 FR-2, AC-2)", () => {
    it("takes the line it runs along, whole", () => {
        const band = bandWords(stroke(MIDDLE(1)), page(), 28);
        expect(band?.words.map((w) => w.start)).toEqual([23, 29, 34, 40]);
        expect(band?.span).toEqual({ start: 23, end: 45 });
    });

    it("takes the line a stroke drawn a little above or below it is closest to — one line only", () => {
        expect(bandWords(stroke(MIDDLE(1) - 0.3 * 28), page(), 28)?.span).toEqual({ start: 23, end: 45 });
        expect(bandWords(stroke(MIDDLE(1) + 0.4 * 28), page(), 28)?.span).toEqual({ start: 23, end: 45 });
        // Just past halfway to the next line: the closer one, never both.
        expect(bandWords(stroke(MIDDLE(1) + 0.55 * 28), page(), 28)?.span).toEqual({ start: 46, end: 68 });
    });

    it("snaps to whole words: a stroke over half a word takes the word when it covers its middle", () => {
        // "beta" is 146–178 (middle 162), "gamma" 184–224 (middle 204).
        expect(bandWords(stroke(MIDDLE(0), 150, 210), page(), 28)?.span).toEqual({ start: 6, end: 16 });
        // Short of beta's middle: from gamma on.
        expect(bandWords(stroke(MIDDLE(0), 170, 300), page(), 28)?.span).toEqual({ start: 11, end: 22 });
    });

    it("covers nothing over the margin, or between lines far from any", () => {
        expect(bandWords(stroke(MIDDLE(1), 500, 700), page(), 28)).toBeNull();
        expect(bandWords(stroke(MIDDLE(2) + 2 * 28), page(), 28)).toBeNull();
        expect(bandWords(stroke(MIDDLE(1)), [], 28)).toBeNull();
    });
});

describe("several lines (#746 FR-5, AC-5)", () => {
    const text = "alpha beta gamma delta\nalpha beta gamma delta alpha";
    const first = { span: { start: 0, end: 22 }, at: 1000 };

    it("extends with the next line drawn within the window, whitespace between", () => {
        expect(extendsHighlight(first, { start: 23, end: 45 }, text, 1000 + EXTEND_WINDOW_MS)).toBe(true);
        // The line above extends too.
        expect(extendsHighlight({ span: { start: 23, end: 45 }, at: 1000 }, { start: 0, end: 22 }, text, 2000)).toBe(true);
    });

    it("does not extend a millisecond late, across a word, or with nothing before it", () => {
        expect(extendsHighlight(first, { start: 23, end: 45 }, text, 1000 + EXTEND_WINDOW_MS + 1)).toBe(false);
        expect(extendsHighlight(first, { start: 29, end: 45 }, text, 1500)).toBe(false);
        expect(extendsHighlight(null, { start: 23, end: 45 }, text, 1500)).toBe(false);
    });
});
