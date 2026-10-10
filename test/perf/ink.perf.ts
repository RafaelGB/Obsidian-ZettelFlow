import { describe, it } from "@jest/globals";
import { appendPoint, newStroke, type InkPoint } from "application/reader/ink/inkStroke";
import { placeInk, type Column, type InkAnchor } from "application/reader/ink/inkAnchor";
import { recognise, type MarkBox } from "application/reader/ink/gestures";
import type { WordBox } from "application/reader/ink/inkAnchor";
import { BUDGETS, checkBudget, describeBudget, type BudgetKey } from "./budgets";

/**
 * Ink budgets (#745 AC-10, epic #740).
 *
 * The nib must lead (FR-18): adding a point costs the same at the end of a long sentence as at its
 * first letter, because smoothing only ever revisits the last point. And a chapter of ink must go
 * back to its words inside the frame of a change of type (FR-22).
 */
function assertBudget(key: BudgetKey, measured: number): void {
    const result = checkBudget(key, measured);
    // eslint-disable-next-line no-console
    console.log(describeBudget(result));
    if (!result.within) throw new Error(`${describeBudget(result)} — this budget exists because: ${BUDGETS[key].because}`);
}

function best(runs: number, work: () => number): number {
    let fastest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < runs; i++) fastest = Math.min(fastest, work());
    return fastest;
}

const point = (i: number): InkPoint => ({ x: i * 0.7 + Math.sin(i / 5) * 3, y: Math.cos(i / 7) * 9, p: 0.5 + 0.3 * Math.sin(i / 13), tilt: 1.2, t: i * 4 });

describe("ink (#745)", () => {
    it("adds a point at the end of a 2,000-point stroke as cheaply as at its start", () => {
        const STROKES = 300;
        const points = Array.from({ length: 2000 }, (_, i) => point(i));
        // The cost of appends 1–100 and of appends 1,901–2,000, over many strokes so a batch is long enough to time.
        const ratio = best(5, () => {
            const strokes = Array.from({ length: STROKES }, () => newStroke("pen"));
            let early = 0;
            let late = 0;
            for (const stroke of strokes) {
                const a = performance.now();
                for (let i = 0; i < 100; i++) appendPoint(stroke, points[i]);
                early += performance.now() - a;
                for (let i = 100; i < 1900; i++) appendPoint(stroke, points[i]);
                const b = performance.now();
                for (let i = 1900; i < 2000; i++) appendPoint(stroke, points[i]);
                late += performance.now() - b;
            }
            return late / Math.max(1e-6, early);
        });
        assertBudget("ink.append.scaling", ratio);
    });

    it("lays out 200 ink notes on a chapter inside a frame", () => {
        const column: Column = { left: 200, width: 600, outerLeft: 0, outerRight: 1000 };
        const notes = Array.from({ length: 200 }, (_, i): { anchor: InkAnchor; word: { left: number; top: number; width: number; height: number } } => ({
            anchor: { quote: { exact: `word ${i}`, prefix: "", suffix: "" }, side: (["text", "left", "right"] as const)[i % 3], x: (i % 10) / 10, line: (i % 5) - 2, em: 16 },
            word: { left: 200 + (i % 8) * 70, top: i * 28, width: 60, height: 16 },
        }));
        const ms = best(5, () => {
            const started = performance.now();
            for (let round = 0; round < 10; round++) for (const note of notes) placeInk(note.anchor, note.word, column, 20, 35);
            return (performance.now() - started) / 10;
        });
        assertBudget("ink.layout.200", ms);
    });

    it("recognises a 1,000-point stroke against a page of words and marks inside a frame (#747 AC-9)", () => {
        // 400 words: 20 lines of 20, 16 px type on a 28 px line; 40 marks among them.
        const words: WordBox[] = [];
        for (let i = 0; i < 400; i++) words.push({ start: i * 6, end: i * 6 + 5, left: 100 + (i % 20) * 44, top: 100 + Math.floor(i / 20) * 28 + 6, width: 40, height: 16 });
        const marks: MarkBox[] = Array.from({ length: 40 }, (_, i) => ({ ref: { kind: "highlight", id: `h${i}` }, rects: [words[i * 10]] }));
        // The worst stroke there is: a closed loop round a quarter of the page, so every check runs to the end.
        const loop = Array.from({ length: 1000 }, (_, i) => {
            const a = (i / 999) * Math.PI * 2.05;
            return { x: 540 + 300 * Math.cos(a) + Math.sin(i / 3), y: 380 + 120 * Math.sin(a) + Math.cos(i / 4) };
        });
        const ctx = { words, marks, linePx: 28, emPx: 16 };
        const ms = best(5, () => {
            const started = performance.now();
            for (let round = 0; round < 10; round++) recognise({ strokes: [loop] }, ctx);
            return (performance.now() - started) / 10;
        });
        assertBudget("ink.classify.1000", ms);
    });
});
