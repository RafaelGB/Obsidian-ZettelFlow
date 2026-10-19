import { describe, it, expect } from "@jest/globals";
import { INK_FILE_COLOUR, type InkStrokeData } from "application/reader/ink/inkSvg";
import type { PageInk } from "application/reader/ink/pageInk";
import type { Thought } from "application/thinking/thought";
import { inkPayloads, pdfPointOf, penOf, turnOf, turnedSize } from "application/reader/share/shareInk";

/** Your pen on the shared copy (#843): where a stroke drawn in Page view lands in the page's own space. */

const point = (x: number, y: number, p = 0.5) => ({ x, y, p, tilt: 0, t: 0 });
const stroke = (colour: InkStrokeData["colour"], points: [number, number][]): InkStrokeData => ({ colour, pointerType: "mouse", points: points.map(([x, y]) => point(x, y)) });

describe("a point of the page as shown, in the page's own space (#843 FR-3)", () => {
    const view: [number, number, number, number] = [36, 36, 648, 828];

    it("maps the four turns as pdf.js does", () => {
        expect(pdfPointOf(view, 0, 10, 20)).toEqual([46, 808]);
        expect(pdfPointOf(view, 90, 10, 20)).toEqual([56, 46]);
        expect(pdfPointOf(view, 180, 10, 20)).toEqual([638, 56]);
        expect(pdfPointOf(view, 270, 10, 20)).toEqual([628, 818]);
    });

    it("sizes a turned page as it is shown, and adds your turn to the page's own", () => {
        expect(turnedSize(view, 0)).toEqual({ W: 612, H: 792 });
        expect(turnedSize(view, 90)).toEqual({ W: 792, H: 612 });
        expect(turnOf(90, 270)).toBe(0);
        expect(turnOf(0, 90)).toBe(90);
    });
});

describe("a drawing, as the copy's ink (#843 FR-4–FR-6)", () => {
    const view: [number, number, number, number] = [0, 0, 612, 792];

    it("writes one ink per colour, in the ink file's own colours, where Page view shows it", () => {
        const drawing = { page: 2, place: { px: 0.5, py: 0.25 }, strokes: [stroke("red", [[0, 0], [1, 0]]), stroke("blue", [[0, 1], [1, 1]]), stroke("red", [[0, 2], [2, 2]])] };
        const payloads = inkPayloads(drawing, view, 0, "Rafa");
        expect(payloads.map((p) => p.color)).toEqual([
            [0xd9, 0x38, 0x3c],
            [0x2f, 0x7d, 0xe1],
        ]);
        expect(INK_FILE_COLOUR.red).toBe("#d9383c");
        const red = payloads[0] as { paths: { lines: Float32Array[]; points: Float32Array[] }; pageIndex: number; user: string; annotationType: number };
        expect(red).toMatchObject({ annotationType: 15, pageIndex: 2, user: "Rafa" });
        expect(red.paths.lines).toHaveLength(2);
        // The first point: half across, a quarter down, from the top — 306 across, 792 − 198 up.
        expect(Array.from(red.paths.points[0].slice(0, 2))).toEqual([306, 594]);
        // One em across is 612 / 40 points.
        expect(red.paths.points[0][2]).toBeCloseTo(306 + 612 / 40, 3);
    });

    it("draws at the width you drew, never thinner than half a point", () => {
        const [payload] = inkPayloads({ page: 0, place: { px: 0, py: 0 }, strokes: [stroke("pencil", [[0, 0], [1, 1]])] }, view, 0);
        expect(payload.thickness as number).toBeGreaterThanOrEqual(0.5);
        const rect = payload.rect as number[];
        expect(rect[0]).toBeLessThan(rect[2]);
        expect(rect[1]).toBeLessThan(rect[3]);
    });

    it("starts each path with a move, and writes a curve as the cubic pdf.js draws", () => {
        const curved: InkStrokeData = { colour: "blue", pointerType: "pen", points: [point(0, 0), point(1, 1), point(2, 0), point(3, 1), point(4, 0)] };
        const [payload] = inkPayloads({ page: 0, place: { px: 0, py: 0 }, strokes: [curved] }, view, 0);
        const line = Array.from((payload.paths as { lines: Float32Array[] }).lines[0]);
        expect(line.slice(0, 4).every(Number.isNaN)).toBe(true);
        // A cubic's controls are numbers; a straight segment's are NaN: this pen's curves are cubics.
        const groups = Array.from({ length: (line.length - 6) / 6 }, (_, i) => line.slice(6 + i * 6, 12 + i * 6));
        expect(groups.some((group) => !Number.isNaN(group[0]))).toBe(true);
        expect((line.length - 6) % 6).toBe(0);
    });
});

describe("what of the pen goes (#843 FR-2, FR-8)", () => {
    const page = (id: string, at: number) => ({ id, at, place: { view: "page" as const, locator: { at: 1, label: "p. 2" }, px: 0.1, py: 0.1, pw: 0.2, ph: 0.1 }, strokes: [stroke("pencil", [[0, 0], [1, 1]])] });

    it("takes Page view's drawings, never one erased since, and counts the ones drawn by the text", () => {
        const ink: PageInk = {
            about: "Papers/p.pdf",
            clusters: [page("a", 5), page("b", 5), { id: "c", at: 5, place: { view: "text", locator: null, quote: null, side: "right", x: 0, line: 0, em: 1 }, strokes: [stroke("red", [[0, 0]])] }],
            erased: { b: 9 },
        };
        const keptPage = { id: "k", at: 1, text: "", links: [], about: "Papers/p.pdf", ink: { drawing: "k.svg", page: { px: 0, py: 0, pw: 0.1, ph: 0.1 } }, locator: { at: 0, label: "p. 1" } } as unknown as Thought;
        const keptText = { id: "t", at: 1, text: "", links: [], about: "Papers/p.pdf", ink: { drawing: "t.svg", side: "left", x: 0, line: 0, em: 1 }, locator: { at: 0, label: "p. 1" } } as unknown as Thought;
        const pen = penOf(ink, [keptPage, keptText]);
        expect(pen.drawings.map((drawing) => drawing.page)).toEqual([1]);
        expect(pen.notes.map((note) => note.id)).toEqual(["k"]);
        expect(pen.beside).toBe(2);
        expect(penOf(null, [])).toEqual({ drawings: [], notes: [], beside: 0 });
    });
});
