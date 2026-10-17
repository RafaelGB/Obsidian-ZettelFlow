import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { SMOOTH, frameVerdict, refreshInterval, type FrameTrace } from "architecture/monitoring/frameVerdict";

const SOURCE = readFileSync(join(__dirname, "..", "..", "..", "src", "architecture", "monitoring", "frameVerdict.ts"), "utf8");
const HZ120 = 1000 / 120;

/** A motion of `n` frames at 120 Hz, a vsync's jitter on each, from `at`. Seeded, so the same every run. */
function frames(n: number, at = 100, every = HZ120): number[] {
    let seed = 7;
    const jitter = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5) * 0.8;
    const out = [at];
    for (let i = 1; i < n; i++) out.push(out[i - 1] + every + jitter());
    return out;
}

function trace(over: Partial<FrameTrace> = {}): FrameTrace {
    const f = over.frames ?? frames(60);
    return { gesture: "page-drag:turn", drive: "tracked", refreshMs: HZ120, frames: f, input: f[0] - HZ120 * 0.6, firstMotion: f[0], layouts: [], ...over };
}

/** A gesture's frames, judged the same on any device (#826 FR-4, FR-5, AC-1). */
describe("whether a gesture held its frames (#826)", () => {
    it("passes a clean motion: every frame on time, none long, moving in the frame after the input", () => {
        const verdict = frameVerdict(trace());
        expect(verdict).toMatchObject({ frames: 60, onTimeShare: 1, overTwo: 0, framesBeforeMotion: 0, layoutInGesture: false, pass: true, failures: [] });
    });

    it("finds a three-frame drop and a layout, and says which", () => {
        const f = frames(60);
        // One frame lost three refreshes after the 30th; a layout in the middle of the motion.
        for (let i = 30; i < f.length; i++) f[i] += 3 * HZ120;
        const layout = f[40] - 1;
        const verdict = frameVerdict(trace({ frames: f, layouts: [f[0] - 50, layout] }));
        expect(verdict.worstMs).toBeCloseTo(4 * HZ120, 0);
        expect(verdict.overTwo).toBe(1);
        expect(verdict.layoutsAt).toEqual([layout]);
        expect(verdict.layoutInGesture).toBe(true);
        expect(verdict.pass).toBe(false);
        expect(verdict.failures).toEqual(["long-frame", "layout"]);
    });

    it("fails a motion that loses more than one frame in twenty", () => {
        const f = frames(40);
        for (let i = 10; i < f.length; i += 6) for (let j = i; j < f.length; j++) f[j] += HZ120;
        const verdict = frameVerdict(trace({ frames: f }));
        expect(verdict.onTimeShare).toBeLessThan(SMOOTH.onTime);
        expect(verdict.failures).toContain("budget");
        expect(verdict.overTwo).toBe(0);
    });

    it("fails a finger's gesture that starts two frames late", () => {
        const f = frames(30);
        const verdict = frameVerdict(trace({ frames: f, input: f[0] - 3 * HZ120 }));
        expect(verdict.framesBeforeMotion).toBe(2);
        expect(verdict.failures).toEqual(["start"]);
    });

    it("gives a motion the clock plays its 100 ms to start", () => {
        const f = frames(30, 1000);
        expect(frameVerdict(trace({ drive: "clock", frames: f, input: 860 })).failures).toEqual(["start"]);
        expect(frameVerdict(trace({ drive: "clock", frames: f, input: 910 })).pass).toBe(true);
    });

    it("stops within a frame when the reader interrupts it", () => {
        const f = frames(20);
        expect(frameVerdict(trace({ frames: f, interrupt: { input: f[10], end: f[11] } })).pass).toBe(true);
        const slow = frameVerdict(trace({ frames: f, interrupt: { input: f[10], end: f[13] } }));
        expect(slow.interruptFrames).toBe(3);
        expect(slow.failures).toEqual(["interrupt"]);
    });

    it("says a layout was not measured where the device cannot say, and judges the rest", () => {
        const verdict = frameVerdict(trace({ layouts: null }));
        expect(verdict.layoutInGesture).toBeNull();
        expect(verdict.pass).toBe(true);
    });

    it("reports style recalculation without gating it — a finger-driven motion is one by definition", () => {
        expect(frameVerdict(trace({ styleRecalcs: 59 }))).toMatchObject({ styleRecalcs: 59, pass: true });
    });

    it("counts in refreshes, so it judges a 60 Hz screen by its own interval", () => {
        expect(frameVerdict(trace({ refreshMs: 1000 / 60, frames: frames(30, 100, 1000 / 60) })).pass).toBe(true);
    });

    it("measures the screen's refresh from idle frames, ignoring the ones it skipped", () => {
        const idle120 = frames(31).slice(1).map((at, i, all) => (i === 0 ? at - 100 : at - all[i - 1]));
        expect(refreshInterval([...idle120, 33.3, 41.6])).toBeCloseTo(HZ120, 0);
        expect(refreshInterval([16.6, 16.7, 16.8, 16.7, 33.4])).toBeCloseTo(16.7, 1);
    });

    it("imports nothing, so jest, the meter and a script judge with the very same function", () => {
        expect(SOURCE).not.toMatch(/^import /m);
    });
});
