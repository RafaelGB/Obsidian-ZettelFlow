import { describe, it, expect } from "@jest/globals";
import { MOTION, flightTransform, motionWelcome } from "architecture/components/core/reader/readerMotion";

describe("motion that never costs a frame (#724)", () => {
    it("carries one box onto another with a translation and a scale, nothing else", () => {
        expect(flightTransform({ left: 10, top: 20, width: 100, height: 150 }, { left: 210, top: 60, width: 400, height: 600 })).toBe(
            "translate(200px, 40px) scale(4, 4)"
        );
    });

    it("turns a page in 280 ms, the shared ease (#753 FR-12)", () => {
        expect(MOTION.page).toBe(280);
    });

    it("plays nothing where it cannot be played, or where reduced motion was asked for", () => {
        expect(motionWelcome({} as HTMLElement)).toBe(false);
        const reduced = { animate: () => undefined, win: { matchMedia: () => ({ matches: true }) } } as unknown as HTMLElement;
        expect(motionWelcome(reduced)).toBe(false);
        const welcome = { animate: () => undefined, win: { matchMedia: () => ({ matches: false }) } } as unknown as HTMLElement;
        expect(motionWelcome(welcome)).toBe(true);
    });
});

