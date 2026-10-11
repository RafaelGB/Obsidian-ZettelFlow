import { describe, it, expect } from "@jest/globals";
import { MOTION, flightTransform, fly, motionWelcome } from "architecture/components/core/reader/readerMotion";
import { DomNode } from "../../../../support/dashboardDom";
import { recordAnimations, type FakeAnimation } from "../../../../support/motionDom";

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


describe("a flight you can finish (#776 FR-26, FR-22)", () => {
    const from = { left: 0, top: 0, width: 800, height: 600 };
    const to = { left: 500, top: 100, width: 100, height: 130 };

    it("returns its animation, and finishing it takes the ghost away", () => {
        const record = recordAnimations();
        try {
            const host = new DomNode();
            const ghost = new DomNode();
            const shot = fly(host as never, ghost as never, from, to, { duration: MOTION.cover }) as unknown as FakeAnimation;
            expect(shot).toBe(record.animations[0]);
            expect(host.children).toContain(ghost);
            shot.finish();
            expect(host.children).not.toContain(ghost);
        } finally {
            record.stop();
        }
    });

    it("draws a grown ghost at the size it lands at, and starts it shrunk onto where it comes from", () => {
        const record = recordAnimations();
        try {
            const host = new DomNode();
            const ghost = new DomNode();
            fly(host as never, ghost as never, to, from, { duration: MOTION.cover, grown: true });
            expect(ghost.cssProps["--zf-ghost-w"]).toBe("800px");
            const frames = record.animations[0].keyframes;
            expect(frames[0].transform).toBe(flightTransform(from, to));
            expect(frames[frames.length - 1].transform).toBe("translate(0px, 0px) scale(1, 1)");
        } finally {
            record.stop();
        }
    });
});
