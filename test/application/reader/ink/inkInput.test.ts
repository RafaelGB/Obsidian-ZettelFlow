import { describe, it, expect } from "@jest/globals";
import { altitudeOf, PALM_WINDOW_MS, routePointer, twoFingerTap, type FingerTrace } from "application/reader/ink/inkInput";

const base = { paletteOpen: true, labSet: true, penDown: false, lastPenUpAt: null as number | null, now: 10_000 };

describe("who draws (#745 E5, AC-6, FR-2, FR-3)", () => {
    it.each([
        ["touch", { paletteOpen: false }, "pass"],
        ["touch", {}, "pass"],
        ["pen", {}, "draw"],
        ["mouse", {}, "draw"],
        ["pen", { paletteOpen: false }, "pass"],
        ["mouse", { paletteOpen: false }, "pass"],
        ["pen", { labSet: false }, "explain"],
        ["mouse", { labSet: false }, "explain"],
        ["touch", { penDown: true }, "reject"],
        ["touch", { lastPenUpAt: 10_000 - PALM_WINDOW_MS }, "reject"],
        ["touch", { lastPenUpAt: 10_000 - PALM_WINDOW_MS - 1 }, "pass"],
        ["touch", { paletteOpen: false, penDown: true }, "pass"],
    ] as const)("a %s with %j is %s", (type, over, route) => {
        expect(routePointer({ ...base, ...over, type })).toBe(route);
    });
});

/** Two fingers: down at `t0` and `t0 + skew`, up after `ms`, each moving `travel` px (a pinch moves them apart). */
function fingers(o: { skew?: number; ms?: number; travel?: number; apart?: number } = {}): FingerTrace[] {
    const skew = o.skew ?? 10;
    const ms = o.ms ?? 120;
    const travel = o.travel ?? 2;
    const apart = o.apart ?? 0;
    return [
        { down: { x: 100, y: 300, t: 0 }, up: { x: 100 - apart / 2, y: 300 + travel, t: ms }, travel: Math.max(travel, apart / 2) },
        { down: { x: 200, y: 300, t: skew }, up: { x: 200 + apart / 2, y: 300 + travel, t: ms + skew }, travel: Math.max(travel, apart / 2) },
    ];
}

describe("a two-finger tap undoes; a pinch or a scroll never does (#745 E5, AC-8, FR-8)", () => {
    it("is a tap: together, quick, still", () => {
        expect(twoFingerTap(fingers())).toBe(true);
    });
    it("is not a pinch: the fingers moved apart 40 px", () => {
        expect(twoFingerTap(fingers({ apart: 40 }))).toBe(false);
    });
    it("is not a two-finger scroll: both travelled 30 px", () => {
        expect(twoFingerTap(fingers({ travel: 30 }))).toBe(false);
    });
    it("is not a hold: 300 ms on the glass", () => {
        expect(twoFingerTap(fingers({ ms: 300 }))).toBe(false);
    });
    it("is not two taps one after the other", () => {
        expect(twoFingerTap(fingers({ skew: 120 }))).toBe(false);
        expect(twoFingerTap(fingers().slice(0, 1))).toBe(false);
    });
});

describe("the pen's lean, from what the platform reports (#745 FR-4)", () => {
    it("reads altitudeAngle where it exists, the tilts where it does not, and upright with neither", () => {
        expect(altitudeOf({ altitudeAngle: 0.7 })).toBe(0.7);
        expect(altitudeOf({})).toBeCloseTo(Math.PI / 2);
        expect(altitudeOf({ tiltX: 45, tiltY: 0 })).toBeCloseTo(Math.PI / 4);
    });
});
