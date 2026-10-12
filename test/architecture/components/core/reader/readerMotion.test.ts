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

describe("a flight that becomes what it lands on (#763 FR-10)", () => {
    const from = { left: 100, top: 200, width: 300, height: 200 };
    const to = { left: 900, top: 120, width: 270, height: 180 };

    it("stays whole to the end, lifts first, and shows the real thing as the ghost goes", () => {
        const record = recordAnimations();
        try {
            const host = new DomNode();
            const ghost = new DomNode();
            const order: string[] = [];
            const shot = fly(host as never, ghost as never, from, to, { duration: MOTION.cover, land: "become", lift: 1.02, onLanded: () => order.push(host.children.includes(ghost) ? "landed, ghost still there" : "landed after") }) as unknown as FakeAnimation;
            const frames = shot.keyframes;
            expect(shot.options.duration).toBe(MOTION.cover);
            // Lifted about its centre, by 1.02, at the start of the same keyframes.
            expect(frames[1]).toEqual({ transform: "translate(-3px, -2px) scale(1.02, 1.02)", opacity: 1, offset: 0.2 });
            expect(frames[frames.length - 1]).toEqual({ transform: flightTransform(from, to), opacity: 1 });
            for (const frame of frames) for (const key of Object.keys(frame)) expect(["transform", "opacity", "offset"]).toContain(key);
            shot.finish();
            // The real picture is shown in the frame the ghost goes: one picture, never two.
            expect(order).toEqual(["landed, ghost still there"]);
            expect(host.children).not.toContain(ghost);
        } finally {
            record.stop();
        }
    });

    it("leaves every other flight as it was: it fades as it lands", () => {
        const record = recordAnimations();
        try {
            const host = new DomNode();
            fly(host as never, new DomNode() as never, from, to, { duration: MOTION.base });
            const frames = record.animations[0].keyframes;
            expect(frames).toHaveLength(3);
            expect(frames[2].opacity).toBe(0);
        } finally {
            record.stop();
        }
    });
});
