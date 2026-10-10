import { describe, it, expect } from "@jest/globals";
import { dragSheet, settleDuration, settleSheet, sheetSnaps } from "architecture/components/core/reader/readerSheet";

/** The bottom sheet's heights and how it settles (#750 D5, FR-7, FR-20, AC-5). */
describe("a bottom sheet in portrait (#750)", () => {
    const snaps = sheetSnaps(1000, 0);

    it("opens at half the reading's height and goes up to nearly all of it, below the status bar", () => {
        expect(snaps).toEqual({ half: 500, full: 920 });
        expect(sheetSnaps(1000, 100).full).toBe(900);
        expect(sheetSnaps(1000, 20).full).toBe(920);
    });

    it("settles to the nearest height, or closes once dragged well down", () => {
        expect(settleSheet(450, 0, snaps)).toBe("half");
        expect(settleSheet(560, 0, snaps)).toBe("half");
        expect(settleSheet(850, 0, snaps)).toBe("full");
        expect(settleSheet(300, 0, snaps)).toBe("closed");
    });

    it("goes the way a flick sends it, whatever the height", () => {
        expect(settleSheet(600, -0.8, snaps)).toBe("closed");
        expect(settleSheet(560, 0.8, snaps)).toBe("full");
        // A slow drift is not a flick: the height decides.
        expect(settleSheet(600, -0.2, snaps)).toBe("half");
    });

    it("follows the finger 1:1, and rubber-bands past the top", () => {
        expect(dragSheet(500, -100, snaps)).toBe(600);
        expect(dragSheet(500, 200, snaps)).toBe(300);
        expect(dragSheet(900, -80, snaps)).toBe(920 + 60 / 3);
        expect(dragSheet(100, 400, snaps)).toBe(0);
    });

    it("settles at the speed it was let go, never in less than a blink nor more than a beat", () => {
        expect(settleDuration(300, 0)).toBe(250);
        expect(settleDuration(300, 3)).toBe(120);
        expect(settleDuration(300, 1)).toBe(300);
        expect(settleDuration(800, 0.5)).toBe(400);
        for (const [d, v] of [[0, 0], [10, 9], [5000, 0.06], [400, -2]]) {
            const ms = settleDuration(d, v);
            expect(ms).toBeGreaterThanOrEqual(120);
            expect(ms).toBeLessThanOrEqual(400);
        }
    });
});
