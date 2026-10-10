import { describe, it, expect } from "@jest/globals";
import {
    lassoHolds,
    lassoWords,
    recognise,
    ARROW_HEAD_ANGLE,
    ARROW_HEAD_MAX,
    ARROW_HEAD_MIN_EM,
    ARROW_MIN_SHAFT_EM,
    ARROW_MIN_STRAIGHTNESS,
    ARROW_REACH_EM,
    ARROW_TIP_TURN,
    CIRCLE_MAX_GAP,
    CIRCLE_MAX_REVERSALS,
    CIRCLE_MAX_TURN,
    CIRCLE_MIN_SIZE_EM,
    CIRCLE_MIN_TURN,
    SCRIBBLE_MAX_AMPLITUDE_CV,
    SCRIBBLE_MAX_HEIGHT_LH,
    SCRIBBLE_MAX_NET_TURN,
    SCRIBBLE_MAX_PITCH,
    SCRIBBLE_MAX_WIDTH_SWINGS,
    SCRIBBLE_MIN_DENSITY,
    SCRIBBLE_MIN_REVERSALS,
    SCRIBBLE_MIN_SWING_EM,
    SCRIBBLE_TOLERANCE_EM,
    type Gesture,
    type GestureContext,
} from "application/reader/ink/gestures";
import { GROUP_IDLE_MS } from "application/reader/ink/inkGroup";
import type { WordBox } from "application/reader/ink/inkAnchor";
import { fixtureNames, loadGesture, synthetic, type GestureFixture } from "../../../support/inkFixtures";

/** The reading line, in ems: a little tighter than the Reader's default, as #746's test. */
const LINE_EM = 1.5;
const SIZES = [14, 18, 24];

type Shape = "line" | "circle" | "arrow" | "scribble" | "ink";
/** The shape a gesture is: an arrow with nothing to link is still an arrow's shape. */
const shapeOf = (g: Gesture): Shape => (g.kind === "arrow-unanchored" ? "arrow" : g.kind);

/** A fixture at a reading size: its points, words and marks scaled together. */
function judge(f: GestureFixture, fontPx: number): Gesture {
    const k = fontPx;
    const box = <B extends { left: number; top: number; width: number; height: number }>(b: B): B => ({ ...b, left: b.left * k, top: b.top * k, width: b.width * k, height: b.height * k });
    const ctx: GestureContext = {
        words: f.words.map(box),
        marks: f.marks.map((m) => ({ ref: m.ref, rects: m.rects.map(box) })),
        linePx: LINE_EM * k,
        emPx: k,
    };
    return recognise({ strokes: f.strokes.map((s) => s.map((p) => ({ x: p.x * k, y: p.y * k }))), ...(f.gapMs !== undefined ? { gapMs: f.gapMs } : {}) }, ctx);
}

const named = (...prefixes: string[]) => fixtureNames().filter((name) => prefixes.some((prefix) => name.startsWith(prefix)));
const CLASSES: Record<Exclude<Shape, "ink">, string[]> = {
    line: named("line-"),
    circle: named("circle-"),
    arrow: named("arrow-"),
    scribble: named("scribble-"),
};
/** Handwriting: every written stroke there is, #745's walk scrawl included. */
const WRITING = named("write-", "walk-mouse-scrawl-", "walk-mouse-page-");
/** Strokes that are no gesture: diagonals, and #745's short slanted mouse line. */
const DIAGONALS = named("diagonal-", "walk-mouse-line-");

describe("one recogniser (#747 FR-1, AC-1)", () => {
    it("has its thresholds as named constants, in reading units", () => {
        expect({ CIRCLE_MAX_GAP, CIRCLE_MIN_SIZE_EM, CIRCLE_MIN_TURN, CIRCLE_MAX_TURN, CIRCLE_MAX_REVERSALS }).toEqual({ CIRCLE_MAX_GAP: 0.25, CIRCLE_MIN_SIZE_EM: 1.2, CIRCLE_MIN_TURN: 1.5 * Math.PI, CIRCLE_MAX_TURN: 3 * Math.PI, CIRCLE_MAX_REVERSALS: 3 });
        expect({ ARROW_MIN_STRAIGHTNESS, ARROW_MIN_SHAFT_EM, ARROW_HEAD_MAX, ARROW_HEAD_MIN_EM, ARROW_HEAD_ANGLE, ARROW_TIP_TURN, ARROW_REACH_EM }).toEqual({
            ARROW_MIN_STRAIGHTNESS: 0.8,
            ARROW_MIN_SHAFT_EM: 2,
            ARROW_HEAD_MAX: 0.35,
            ARROW_HEAD_MIN_EM: 0.3,
            ARROW_HEAD_ANGLE: [20, 70],
            ARROW_TIP_TURN: 100,
            ARROW_REACH_EM: 0.8,
        });
        expect({
            SCRIBBLE_MIN_REVERSALS,
            SCRIBBLE_MIN_DENSITY,
            SCRIBBLE_MAX_AMPLITUDE_CV,
            SCRIBBLE_MAX_HEIGHT_LH,
            SCRIBBLE_MIN_SWING_EM,
            SCRIBBLE_MAX_WIDTH_SWINGS,
            SCRIBBLE_MAX_PITCH,
            SCRIBBLE_MAX_NET_TURN,
            SCRIBBLE_TOLERANCE_EM,
        }).toEqual({
            SCRIBBLE_MIN_REVERSALS: 6,
            SCRIBBLE_MIN_DENSITY: 4,
            SCRIBBLE_MAX_AMPLITUDE_CV: 0.35,
            SCRIBBLE_MAX_HEIGHT_LH: 2.5,
            SCRIBBLE_MIN_SWING_EM: 0.6,
            SCRIBBLE_MAX_WIDTH_SWINGS: 1.6,
            SCRIBBLE_MAX_PITCH: 0.25,
            SCRIBBLE_MAX_NET_TURN: 3 * Math.PI,
            SCRIBBLE_TOLERANCE_EM: 0.25,
        });
    });

    it("has at least 20 recorded strokes of every class, and of handwriting", () => {
        for (const [shape, names] of Object.entries(CLASSES)) expect({ shape, enough: names.length >= 20 }).toEqual({ shape, enough: true });
        expect(named("arrow-1-").length).toBeGreaterThanOrEqual(20);
        expect(named("arrow-2-").length).toBeGreaterThanOrEqual(20);
        expect(WRITING.length).toBeGreaterThanOrEqual(40);
    });

    it.each(SIZES)("reads at least 95%% of every class right at %i px (the confusion matrix)", (fontPx) => {
        const matrix: Record<string, Record<Shape, number>> = {};
        for (const [shape, names] of [...Object.entries(CLASSES), ["ink", [...WRITING, ...DIAGONALS]] as const]) {
            const row: Record<Shape, number> = { line: 0, circle: 0, arrow: 0, scribble: 0, ink: 0 };
            for (const name of names) row[shapeOf(judge(loadGesture(name), fontPx))]++;
            matrix[shape] = row;
        }
        for (const [shape, row] of Object.entries(matrix)) {
            const total = Object.values(row).reduce((sum, n) => sum + n, 0);
            expect({ shape, row, rate: row[shape as Shape] / total >= 0.95 }).toEqual({ shape, row, rate: true });
        }
    });

    it.each(SIZES)("links the two marks a recorded arrow is drawn between, tail to tip, at %i px", (fontPx) => {
        const wrong = named("arrow-1-", "arrow-2-").filter((name) => {
            const g = judge(loadGesture(name), fontPx);
            return g.kind !== "arrow" || g.from.id !== "A" || g.to.id !== "B";
        });
        expect(wrong.length / named("arrow-1-", "arrow-2-").length).toBeLessThanOrEqual(0.05);
    });

    it.each(SIZES)("erases what a recorded scribble is drawn over, at %i px", (fontPx) => {
        const missed = named("scribble-").filter((name) => {
            const g = judge(loadGesture(name), fontPx);
            return g.kind === "scribble" && !g.hits.some((hit) => hit.id === "X");
        });
        expect(missed).toEqual([]);
    });
});

describe("destructive gestures need the most certainty (#747 FR-2, AC-2)", () => {
    it.each(SIZES)("never reads handwriting, a circle or an arrow as a scribble, at %i px", (fontPx) => {
        const erased = [...WRITING, ...DIAGONALS, ...CLASSES.circle, ...CLASSES.arrow, ...CLASSES.line].filter((name) => judge(loadGesture(name), fontPx).kind === "scribble");
        expect(erased).toEqual([]);
    });

    it.each(SIZES)("never reads handwriting as a circle round more than one word, at %i px", (fontPx) => {
        const circled = WRITING.filter((name) => {
            const g = judge(loadGesture(name), fontPx);
            return g.kind === "circle" && g.words.length > 1;
        });
        expect(circled).toEqual([]);
    });

    it("never reads the synthetic handwriting as a scribble", () => {
        const ctx: GestureContext = { words: [], marks: [], linePx: 28, emPx: 16 };
        for (const stroke of synthetic()) expect({ name: stroke.name, kind: recognise({ strokes: [stroke.points] }, ctx).kind === "scribble" }).toEqual({ name: stroke.name, kind: false });
    });

    it("checks the scribble last: a stroke both closed and dense is a circle or ink, never an erase", () => {
        // Round and round three times over a word: closed, dense, regular — and it loops.
        const loops = Array.from({ length: 181 }, (_, i) => {
            const a = (i / 180) * Math.PI * 6;
            return { x: 100 + 30 * Math.cos(a), y: 50 + 12 * Math.sin(a) };
        });
        const word: WordBox = { start: 0, end: 4, left: 85, top: 44, width: 30, height: 12 };
        const ctx: GestureContext = { words: [word], marks: [{ ref: { kind: "highlight", id: "h" }, rects: [word] }], linePx: 28, emPx: 16 };
        expect(["circle", "ink"]).toContain(recognise({ strokes: [loops] }, ctx).kind);
    });
});

/** A page in px: three lines of five words, 16 px type on a 28 px line. */
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
const CTX = (over: Partial<GestureContext> = {}): GestureContext => ({ words: page(), marks: [], linePx: 28, emPx: 16, ...over });

describe("a circle keeps its words as a question (#747 FR-3, AC-3)", () => {
    it("takes the whole words inside it, first to last in text order", () => {
        // Round the 2nd and 3rd words of the middle line (lefts 160 and 220, middle 142).
        const g = recognise({ strokes: [ellipse(214, 142, 70, 16)] }, CTX());
        expect(g.kind).toBe("circle");
        if (g.kind !== "circle") return;
        expect(g.span).toEqual({ start: 36, end: 47 });
        expect(g.words.map((w) => w.start)).toEqual([36, 42]);
    });

    it("is ink round no words: a loop in the margin", () => {
        expect(recognise({ strokes: [ellipse(700, 142, 60, 20)] }, CTX()).kind).toBe("ink");
    });

    it("is ink when it is a written o, too small to be a circle", () => {
        expect(recognise({ strokes: [ellipse(184, 142, 6, 6)] }, CTX()).kind).toBe("ink");
    });

    it("is ink when it is left open", () => {
        expect(recognise({ strokes: [ellipse(214, 142, 70, 16, 64, 1.4 * Math.PI)] }, CTX()).kind).toBe("ink");
    });
});

describe("an arrow links two marks (#747 FR-4, AC-4)", () => {
    const A = { ref: { kind: "highlight" as const, id: "a" }, rects: [{ left: 100, top: 106, width: 108, height: 16 }] };
    const B = { ref: { kind: "ink" as const, id: "b" }, rects: [{ left: 340, top: 162, width: 60, height: 16 }] };
    const shaft = (from: { x: number; y: number }, to: { x: number; y: number }, n = 30) => Array.from({ length: n + 1 }, (_, i) => ({ x: from.x + ((to.x - from.x) * i) / n, y: from.y + ((to.y - from.y) * i) / n }));
    /** A one-stroke arrow from (150,114) to (370,170), its barb back at 35°. */
    const arrow = (tip = { x: 370, y: 170 }) => {
        const tail = { x: 150, y: 114 };
        const back = Math.atan2(tail.y - tip.y, tail.x - tip.x) + (35 * Math.PI) / 180;
        const barb = { x: tip.x + 30 * Math.cos(back), y: tip.y + 30 * Math.sin(back) };
        return [...shaft(tail, tip), ...shaft(tip, barb, 6).slice(1)];
    };

    it("links the mark at its tail to the mark at its tip", () => {
        const g = recognise({ strokes: [arrow()] }, CTX({ marks: [A, B] }));
        expect(g).toMatchObject({ kind: "arrow", from: { id: "a" }, to: { id: "b" } });
    });

    it("is an arrow with nothing to link when an end is on plain text, or both on one mark", () => {
        expect(recognise({ strokes: [arrow({ x: 500, y: 250 })] }, CTX({ marks: [A, B] })).kind).toBe("arrow-unanchored");
        expect(recognise({ strokes: [arrow()] }, CTX({ marks: [A] })).kind).toBe("arrow-unanchored");
    });

    it("takes a head drawn as a second stroke within the grouping window — and not after it", () => {
        const tip = { x: 370, y: 170 };
        const tail = { x: 150, y: 114 };
        const back = Math.atan2(tail.y - tip.y, tail.x - tip.x);
        const arm = (a: number) => ({ x: tip.x + 30 * Math.cos(back + a), y: tip.y + 30 * Math.sin(back + a) });
        const head = [...shaft(arm(0.6), tip, 6), ...shaft(tip, arm(-0.6), 6).slice(1)];
        expect(recognise({ strokes: [shaft(tail, tip), head], gapMs: 400 }, CTX({ marks: [A, B] }))).toMatchObject({ kind: "arrow", from: { id: "a" }, to: { id: "b" } });
        expect(recognise({ strokes: [shaft(tail, tip), head], gapMs: GROUP_IDLE_MS + 1 }, CTX({ marks: [A, B] })).kind).toBe("ink");
    });

    it("is ink when the shaft is too short to be one: a written v", () => {
        const v = [...shaft({ x: 100, y: 100 }, { x: 108, y: 112 }, 6), ...shaft({ x: 108, y: 112 }, { x: 116, y: 100 }, 6).slice(1)];
        expect(recognise({ strokes: [v] }, CTX({ marks: [A, B] })).kind).toBe("ink");
    });
});

describe("a scribble erases what it is drawn over (#747 FR-5, AC-5)", () => {
    const H = { ref: { kind: "highlight" as const, id: "h" }, rects: [{ left: 160, top: 134, width: 108, height: 16 }] };
    /** Back and forth over the mark, eight times, drifting down its height. */
    const scratch = (left = 150, right = 278) => Array.from({ length: 9 }, (_, k) => ({ x: k % 2 ? right : left, y: 134 + k * 2 })).flatMap((p, k, all) => (k === 0 ? [p] : Array.from({ length: 8 }, (_, j) => ({ x: all[k - 1].x + ((p.x - all[k - 1].x) * (j + 1)) / 8, y: all[k - 1].y + ((p.y - all[k - 1].y) * (j + 1)) / 8 }))));

    it("names the marks it passes over", () => {
        expect(recognise({ strokes: [scratch()] }, CTX({ marks: [H] }))).toEqual({ kind: "scribble", hits: [H.ref] });
    });

    it("hits nothing over the empty margin, and is still a scribble: nothing is kept for it", () => {
        expect(recognise({ strokes: [scratch(700, 828)] }, CTX({ marks: [H] }))).toEqual({ kind: "scribble", hits: [] });
    });

    it("is ink when it moves on as it turns, as handwriting does", () => {
        const zigzag = Array.from({ length: 13 }, (_, k) => ({ x: 100 + k * 30, y: 134 + (k % 2) * 16 }));
        expect(recognise({ strokes: [zigzag] }, CTX({ marks: [H] })).kind).not.toBe("scribble");
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
