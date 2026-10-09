import { describe, it, expect } from "@jest/globals";
import {
    bandWords,
    extendsHighlight,
    isLineStroke,
    strokeMetrics,
    EXTEND_WINDOW_MS,
    LINE_BAND_LH,
    LINE_MAX_CLOSURE,
    LINE_MAX_HEIGHT_LH,
    LINE_MAX_SLOPE,
    LINE_MIN_STRAIGHTNESS,
    LINE_MIN_WIDTH_EM,
} from "application/reader/ink/strokeHighlight";
import type { WordBox } from "application/reader/ink/inkAnchor";
import { fixtureNames, loadInk, synthetic } from "../../../support/inkFixtures";

/** The reading line, in ems: a little tighter than the Reader's default, so the test is the stricter. */
const LINE_EM = 1.5;
const SIZES = [14, 18, 24];

/** A recorded stroke (kept in ems) at a reading size: points and line height scaled together. */
function at(name: string, fontPx: number) {
    const points = loadInk(name).strokes.flatMap((stroke) => stroke.points.map((p) => ({ x: p.x * fontPx, y: p.y * fontPx })));
    return { metrics: strokeMetrics(points), ctx: { linePx: LINE_EM * fontPx, emPx: fontPx } };
}

const named = (prefix: string) => fixtureNames().filter((name) => name.startsWith(prefix));
const LINES = named("line-");
const NOT_LINES = [...named("write-"), ...named("diagonal-"), ...named("circle-"), ...named("arrow-")];

describe("a line, not a drawing (#746 FR-1, AC-1)", () => {
    it("has its thresholds as named constants, in reading units", () => {
        expect({ LINE_MAX_HEIGHT_LH, LINE_MIN_WIDTH_EM, LINE_MAX_SLOPE, LINE_MIN_STRAIGHTNESS, LINE_MAX_CLOSURE, LINE_BAND_LH, EXTEND_WINDOW_MS }).toEqual({
            LINE_MAX_HEIGHT_LH: 0.6,
            LINE_MIN_WIDTH_EM: 2.5,
            LINE_MAX_SLOPE: 0.12,
            LINE_MIN_STRAIGHTNESS: 0.85,
            LINE_MAX_CLOSURE: 0.3,
            LINE_BAND_LH: 0.75,
            EXTEND_WINDOW_MS: 4000,
        });
    });

    it("has recorded strokes of every class to judge", () => {
        expect(LINES.length).toBeGreaterThanOrEqual(20);
        expect(named("diagonal-").length).toBeGreaterThanOrEqual(10);
        expect(named("write-flat-").length).toBeGreaterThanOrEqual(10);
        expect(named("circle-").length + named("arrow-").length).toBeGreaterThan(0);
    });

    it.each(SIZES)("accepts every recorded line stroke at %i px", (fontPx) => {
        const missed = LINES.filter((name) => {
            const { metrics, ctx } = at(name, fontPx);
            return !isLineStroke(metrics, ctx);
        });
        expect(missed).toEqual([]);
    });

    it.each(SIZES)("rejects handwriting, long flat words, diagonals, circles and arrows at %i px", (fontPx) => {
        const taken = NOT_LINES.filter((name) => {
            const { metrics, ctx } = at(name, fontPx);
            return isLineStroke(metrics, ctx);
        });
        expect(taken).toEqual([]);
    });

    it("rejects the synthetic handwriting, and #745's walk scrawl", () => {
        for (const stroke of synthetic()) expect({ name: stroke.name, line: isLineStroke(strokeMetrics(stroke.points), { linePx: 28, emPx: 16 }) }).toEqual({ name: stroke.name, line: false });
        const { metrics, ctx } = at("walk-mouse-scrawl-01", 16);
        expect(isLineStroke(metrics, ctx)).toBe(false);
    });

    it("rejects a word too short to be two words, and a stroke too tall to be on one line", () => {
        const flat = (width: number, height: number) => strokeMetrics([{ x: 0, y: 0 }, { x: width / 2, y: height }, { x: width, y: 0 }]);
        expect(isLineStroke(flat(2 * 16, 0), { linePx: 24, emPx: 16 })).toBe(false);
        expect(isLineStroke(flat(3 * 16, 0), { linePx: 24, emPx: 16 })).toBe(true);
        expect(isLineStroke(flat(30 * 16, 0.7 * 24), { linePx: 24, emPx: 16 })).toBe(false);
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
