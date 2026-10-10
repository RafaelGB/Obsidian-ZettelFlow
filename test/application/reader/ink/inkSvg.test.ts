import { describe, it, expect } from "@jest/globals";
import { isUnreadable, keptPoints, parseInkSvg, renderInkSvg, INK_PRECISION, type InkDrawing } from "application/reader/ink/inkSvg";
import { synthetic } from "../../../support/inkFixtures";

/** The synthetic strokes, in ems (as a kept drawing is). */
function drawing(): InkDrawing {
    return {
        strokes: synthetic().map((s, i) => ({
            colour: (["pencil", "red", "blue", "green"] as const)[i % 4],
            pointerType: i === 2 ? "mouse" : "pen",
            points: s.points.map((pt) => ({ ...pt, x: pt.x / 16, y: pt.y / 16 })),
        })),
    };
}

describe("the drawing's file (#745 E3, AC-3)", () => {
    it("round-trips the points losslessly at the kept precision", () => {
        const source = drawing();
        const parsed = parseInkSvg(renderInkSvg(source));
        expect(isUnreadable(parsed)).toBe(false);
        const back = parsed as InkDrawing;
        expect(back.strokes).toHaveLength(source.strokes.length);
        back.strokes.forEach((stroke, i) => {
            expect(stroke.points).toEqual(keptPoints(source.strokes[i].points));
            expect(stroke.pointerType).toBe(source.strokes[i].pointerType);
        });
        expect(INK_PRECISION).toBe(3);
    });

    it("draws its visible paths as a pure function of the points: two renders are byte-equal", () => {
        expect(renderInkSvg(drawing())).toBe(renderInkSvg(drawing()));
        // …and a render of what was read back is the file again.
        const text = renderInkSvg(drawing());
        expect(renderInkSvg(parseInkSvg(text) as InkDrawing)).toBe(text);
    });

    it("keeps the colour by name, and reads an unknown name as pencil", () => {
        const text = renderInkSvg(drawing());
        expect(text).toContain('data-ink="red"');
        expect((parseInkSvg(text) as InkDrawing).strokes.map((s) => s.colour)).toEqual(["pencil", "red", "blue", "green"]);
        const odd = text.replace('"c":"red"', '"c":"chartreuse"');
        expect((parseInkSvg(odd) as InkDrawing).strokes[1].colour).toBe("pencil");
    });

    it("keeps a drawing from a newer version as unreadable, never dropped", () => {
        const future = renderInkSvg(drawing()).replace('"v":1', '"v":99');
        expect(parseInkSvg(future)).toEqual({ unreadable: true, version: 99 });
        expect(parseInkSvg("<svg/>")).toEqual({ unreadable: true, version: null });
        expect(parseInkSvg('<svg><metadata id="zettelflow-ink">{not json</metadata></svg>')).toEqual({ unreadable: true, version: null });
    });

    it("never writes a script or an event handler, and reads only its own metadata", () => {
        const text = renderInkSvg(drawing());
        expect(text).not.toMatch(/<script|\son[a-z]+=/i);
        const hostile = text.replace("<g ", '<script>alert(1)</script><g onload="alert(1)" ');
        const parsed = parseInkSvg(hostile) as InkDrawing;
        expect(parsed.strokes).toHaveLength(4);
        expect(renderInkSvg(parsed)).toBe(text);
    });
});
