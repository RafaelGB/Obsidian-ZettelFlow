import { describe, it, expect } from "@jest/globals";
import { flightTransform, motionWelcome, setCoverFlight, takeCoverFlight } from "architecture/components/core/reader/readerMotion";

describe("motion that never costs a frame (#724)", () => {
    it("carries one box onto another with a translation and a scale, nothing else", () => {
        expect(flightTransform({ left: 10, top: 20, width: 100, height: 150 }, { left: 210, top: 60, width: 400, height: 600 })).toBe(
            "translate(200px, 40px) scale(4, 4)"
        );
    });

    it("plays nothing where it cannot be played, or where reduced motion was asked for", () => {
        expect(motionWelcome({} as HTMLElement)).toBe(false);
        const reduced = { animate: () => undefined, win: { matchMedia: () => ({ matches: true }) } } as unknown as HTMLElement;
        expect(motionWelcome(reduced)).toBe(false);
        const welcome = { animate: () => undefined, win: { matchMedia: () => ({ matches: false }) } } as unknown as HTMLElement;
        expect(motionWelcome(welcome)).toBe(true);
    });

    it("hands the clicked cover to the Reader once, and only while it is fresh", () => {
        const cover = { getBoundingClientRect: () => ({ left: 1, top: 2, width: 30, height: 45 }) } as unknown as HTMLElement;
        setCoverFlight(cover);
        expect(takeCoverFlight()?.rect.width).toBe(30);
        expect(takeCoverFlight()).toBeNull();
        setCoverFlight({ getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }) } as unknown as HTMLElement);
        expect(takeCoverFlight()).toBeNull();
    });
});

describe("the cover opens into the page, gracefully (owner: the first version was coarse)", () => {
    it("keeps the cover's shape: one scale for both sides, never stretched to the page", async () => {
        const { coverLanding } = await import("architecture/components/core/reader/readerMotion");
        const cover = { left: 100, top: 400, width: 120, height: 180 };
        const column = { left: 260, top: 230, width: 1060, height: 900 };
        const to = coverLanding(cover, column);
        expect(to.width / to.height).toBeCloseTo(cover.width / cover.height, 5);
        expect(to.width).toBeLessThanOrEqual(cover.width * 1.5);
        // Centred on the column, near its top, where the text is about to appear.
        expect(to.left + to.width / 2).toBeCloseTo(column.left + column.width / 2, 5);
        expect(to.top).toBeGreaterThanOrEqual(column.top);
        expect(to.top + to.height).toBeLessThanOrEqual(column.top + column.height);
    });

    it("never grows a cover past a third of a narrow column", async () => {
        const { coverLanding } = await import("architecture/components/core/reader/readerMotion");
        const to = coverLanding({ left: 0, top: 0, width: 200, height: 300 }, { left: 0, top: 0, width: 360, height: 700 });
        expect(to.width).toBeLessThanOrEqual(120 + 0.001);
    });
});
