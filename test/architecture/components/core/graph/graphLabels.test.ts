import { describe, it, expect } from "@jest/globals";
import {
    LABEL_BUDGET,
    LABEL_MAX_CHARS,
    labelCandidates,
    labelText,
    placeLabels,
    placeRegionNames,
    rankForLabels,
} from "architecture/components/core/graph/graphLabels";

const view = { width: 800, height: 600 };
const measure = (text: string) => text.length * 6;

/**
 * **Labels on one overlay** (#695): a short ranked list each frame, placed without collisions —
 * never a texture per note, which is how the old view leaked GPU memory every 300 ms.
 */
describe("who earns a name (#695)", () => {
    it("names what you point at first, then what you marked, then the answer", () => {
        const candidates = labelCandidates({ hover: 9, marked: [4], ranked: [1, 2, 3], hubs: [7, 8], density: "more" });
        expect(candidates.map((c) => c.index)).toEqual([9, 4, 1, 2, 3]);
        expect(candidates.slice(0, 2).every((c) => c.strong)).toBe(true);
        expect(candidates.slice(2).every((c) => !c.strong)).toBe(true);
    });

    it("names the hubs when nothing is asked", () => {
        expect(labelCandidates({ hover: null, marked: [], ranked: null, hubs: [7, 8], density: "few" }).map((c) => c.index)).toEqual([7, 8]);
    });

    it("never names a note twice", () => {
        const candidates = labelCandidates({ hover: 1, marked: [1], ranked: [1, 2], hubs: [], density: "more" });
        expect(candidates.map((c) => c.index)).toEqual([1, 2]);
    });

    it("keeps to the density's budget", () => {
        const ranked = Array.from({ length: 50 }, (_, i) => i);
        expect(labelCandidates({ hover: null, marked: [], ranked, hubs: [], density: "few" })).toHaveLength(LABEL_BUDGET.few.answer);
        expect(labelCandidates({ hover: null, marked: [], ranked, hubs: [], density: "more" })).toHaveLength(LABEL_BUDGET.more.answer);
    });
});

describe("where a name goes (#695)", () => {
    it("sits above its dot", () => {
        const [label] = placeLabels([{ index: 0, strong: false }], () => ({ x: 400, y: 300, r: 5 }), () => "note", measure, view);
        expect(label.x + label.w / 2).toBe(400);
        expect(label.y + label.h).toBeLessThan(300);
    });

    it("skips a name that would cover one already placed", () => {
        const placed = placeLabels(
            [
                { index: 0, strong: true },
                { index: 1, strong: false },
                { index: 2, strong: false },
            ],
            (i) => (i === 2 ? { x: 100, y: 100, r: 3 } : { x: 400, y: 300, r: 3 }),
            () => "a note",
            measure,
            view
        );
        expect(placed.map((p) => p.index)).toEqual([0, 2]);
    });

    it("skips a name that would leave the view, and a note that is not on screen", () => {
        const placed = placeLabels(
            [
                { index: 0, strong: false },
                { index: 1, strong: false },
            ],
            (i) => (i === 0 ? { x: 2, y: 300, r: 3 } : null),
            () => "a long enough name",
            measure,
            view
        );
        expect(placed).toEqual([]);
    });

    it("cuts a long name with an ellipsis", () => {
        const long = "x".repeat(80);
        expect(labelText(long)).toHaveLength(LABEL_MAX_CHARS);
        expect(labelText(long).endsWith("…")).toBe(true);
        expect(labelText("short")).toBe("short");
    });
});

describe("region names (#697)", () => {
    it("names a region from afar, in capitals, and not when it fills the view", () => {
        const far = placeRegionNames([0], () => ({ x: 400, y: 300, span: 40 }), () => "Distributed systems", measure, view);
        expect(far.map((p) => p.text)).toEqual(["DISTRIBUTED SYSTEMS"]);
        const near = placeRegionNames([0], () => ({ x: 400, y: 300, span: 400 }), () => "Distributed systems", measure, view);
        expect(near).toEqual([]);
    });

    it("never lays two names on top of each other", () => {
        const placed = placeRegionNames([0, 1], () => ({ x: 400, y: 300, span: 30 }), (i) => `Region ${i}`, measure, view);
        expect(placed).toHaveLength(1);
    });

    it("gives way to a note's label already there — a region named after its hub drew its name over it", () => {
        const note = { index: 3, text: "Login usuarios internos", x: 330, y: 288, w: 150, h: 22, strong: false };
        const over = placeRegionNames([0], () => ({ x: 400, y: 300, span: 30 }), () => "Login usuarios internos", measure, view, [note]);
        expect(over).toEqual([]);
        const clear = placeRegionNames([0], () => ({ x: 400, y: 100, span: 30 }), () => "Login usuarios internos", measure, view, [note]);
        expect(clear).toHaveLength(1);
    });
});

describe("ranking the answer once, not every frame (#695)", () => {
    it("keeps the best connected, in order — the same as sorting everything", () => {
        const degree = Float32Array.from({ length: 500 }, (_, i) => (i * 7919) % 101);
        const lit = Array.from({ length: 500 }, (_, i) => i);
        const ranked = rankForLabels(lit, degree, 32);
        const sorted = [...lit].sort((a, b) => degree[b] - degree[a]).slice(0, 32);
        expect(ranked.map((i) => degree[i])).toEqual(sorted.map((i) => degree[i]));
    });

    it("handles an answer smaller than the list", () => {
        const degree = Float32Array.from([1, 5, 3]);
        expect(rankForLabels([0, 1, 2], degree)).toEqual([1, 2, 0]);
    });
});
