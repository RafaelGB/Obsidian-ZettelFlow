import { describe, it, expect } from "@jest/globals";
import * as gestures from "application/reader/ink/gestures";
import { lassoHolds, lassoWords } from "application/reader/ink/gestures";
import type { WordBox } from "application/reader/ink/inkAnchor";

function page(): WordBox[] {
    const words: WordBox[] = [];
    let at = 0;
    for (let line = 0; line < 3; line++) {
        for (let i = 0; i < 5; i++) {
            words.push({ start: at, end: at + 5, left: 100 + i * 60, top: 100 + line * 28 + 6, width: 48, height: 16 });
            at += 6;
        }
    }
    return words;
}
const ellipse = (cx: number, cy: number, rx: number, ry: number, n = 64, sweep = 2.05 * Math.PI) => Array.from({ length: n + 1 }, (_, i) => ({ x: cx + rx * Math.cos((i / n) * sweep), y: cy + ry * Math.sin((i / n) * sweep) }));

describe("the pen only draws (#790 FR-2)", () => {
    it("has no recogniser left to read a pen stroke as a gesture", () => {
        expect("recognise" in gestures).toBe(false);
    });
});

describe("the lasso (#747 FR-7, AC-6)", () => {
    it("holds the words whose middle is inside the loop, in text order", () => {
        const held = lassoWords(ellipse(214, 142, 75, 20, 48, 2 * Math.PI), page());
        expect(held?.span).toEqual({ start: 36, end: 47 });
        expect(lassoWords(ellipse(700, 142, 60, 20), page())).toBeNull();
    });

    it("holds a box whose middle is inside the loop", () => {
        expect(lassoHolds(ellipse(214, 142, 75, 20), { left: 200, top: 135, width: 20, height: 10 })).toBe(true);
        expect(lassoHolds(ellipse(214, 142, 75, 20), { left: 400, top: 135, width: 20, height: 10 })).toBe(false);
    });
});
