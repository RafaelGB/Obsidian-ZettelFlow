import { describe, it, expect } from "@jest/globals";
import { defaultCamera, viewProjection } from "architecture/components/core/graph/graphCamera";
import { pickNearest, PICK_RADIUS } from "architecture/components/core/graph/graphPick";

const view = { width: 800, height: 600 };
const cam = { ...defaultCamera(true), dist: 820 };
const m = viewProjection(cam, view.width, view.height);
// Flat sheet at dist 820: 1.05 px per unit, centred on (0, 0).
const positions = new Float32Array([0, 0, 0, 100, 0, 0, -100, 0, 0]);
const visible = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
const degree = new Float32Array([1, 1, 1]);

/**
 * **A click lands on the note you see** (#693, #695): picked with the matrix the GPU draws with.
 */
describe("picking (#695)", () => {
    it("finds the dot under the pointer", () => {
        expect(pickNearest(m, cam, positions, visible, degree, 3, 400, 300, view, null)).toBe(0);
        expect(pickNearest(m, cam, positions, visible, degree, 3, 400 + 105, 300, view, null)).toBe(1);
    });

    it("finds nothing out of reach", () => {
        expect(pickNearest(m, cam, positions, visible, degree, 3, 400, 300 + PICK_RADIUS + 5, view, null)).toBeNull();
    });

    it("never picks a note that is not there yet (#697)", () => {
        const hidden = new Float32Array(visible);
        hidden[3] = 0;
        expect(pickNearest(m, cam, positions, hidden, degree, 3, 400, 300, view, null)).toBeNull();
    });

    it("picks only the answer's notes while an answer is up", () => {
        expect(pickNearest(m, cam, positions, visible, degree, 3, 400, 300, view, new Set([1]))).toBeNull();
        expect(pickNearest(m, cam, positions, visible, degree, 3, 505, 300, view, new Set([1]))).toBe(1);
    });

    it("lets a bigger note reach a little further", () => {
        const heavy = new Float32Array([1, 100, 1]);
        // Twenty pixels off: out of reach for a lone note, within reach of a hub.
        expect(pickNearest(m, cam, positions, visible, degree, 3, 505 - 20, 300, view, null)).toBeNull();
        expect(pickNearest(m, cam, positions, visible, heavy, 3, 505 - 20, 300, view, null)).toBe(1);
    });
});
