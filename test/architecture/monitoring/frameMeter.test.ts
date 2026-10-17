import { describe, it, expect, afterEach } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { clearFrameTraces, frameMeterOn, frameTraces, meteredRefreshMs, meterGesture, setFrameMeter, TRACES_PER_GESTURE } from "architecture/monitoring/frameMeter";
import { fakeFrames } from "../../support/fakeFrames";

const SOURCE = readFileSync(join(__dirname, "..", "..", "..", "src", "architecture", "monitoring", "frameMeter.ts"), "utf8");

/** The frame meter, a developer's instrument (#826 FR-3). */
describe("the frame meter (#826)", () => {
    afterEach(() => {
        setFrameMeter(false);
        clearFrameTraces();
    });

    it("costs nothing when off: one handle for every gesture, and nothing asked of the window", () => {
        const f = fakeFrames();
        expect(frameMeterOn()).toBe(false);
        const a = meterGesture("page-drag", "tracked", f.win);
        const b = meterGesture("chapter-turn:leaf:clock", "clock", f.win);
        expect(a).toBe(b);
        a.moved();
        a.interrupted();
        a.end("turn");
        expect(f.win.requestAnimationFrame).not.toHaveBeenCalled();
        expect(f.win.addEventListener).not.toHaveBeenCalled();
        expect(frameTraces().size).toBe(0);
    });

    it("reads the screen's refresh rate from the motion's own frames", () => {
        const f = fakeFrames(1000 / 60);
        setFrameMeter(true);
        const meter = meterGesture("open-shot", "clock", f.win);
        f.frames(20);
        meter.end();
        f.frames(4);
        expect(meteredRefreshMs()).toBeCloseTo(16.7, 0);
    });

    it("times a finger's gesture from its first move to its end, and judges it", () => {
        const f = fakeFrames();
        setFrameMeter(true);
        const meter = meterGesture("page-drag", "tracked", f.win);
        f.frames(2);
        f.input("pointermove");
        meter.moved();
        f.frames(20);
        meter.end("turn");
        f.frames(4);
        const [kept] = frameTraces().get("page-drag:turn") ?? [];
        expect(kept.trace.frames.length).toBeGreaterThanOrEqual(20);
        expect(kept.verdict.framesBeforeMotion).toBe(0);
        expect(kept.verdict.pass).toBe(true);
        // A device cannot say when it laid out: not measured, never a pass of its own.
        expect(kept.verdict.layoutInGesture).toBeNull();
    });

    it("sees a stall in the motion", () => {
        const f = fakeFrames();
        setFrameMeter(true);
        const meter = meterGesture("chapter-turn:leaf:clock", "clock", f.win);
        f.frames(10);
        f.frames(1, 5 * (1000 / 120));
        f.frames(10);
        meter.end();
        f.frames(4);
        const [kept] = frameTraces().get("chapter-turn:leaf:clock") ?? [];
        expect(kept.verdict.failures).toContain("long-frame");
    });

    it("keeps the last few traces of each gesture", () => {
        const f = fakeFrames();
        setFrameMeter(true);
        for (let i = 0; i < TRACES_PER_GESTURE + 3; i++) {
            const meter = meterGesture("open-shot", "clock", f.win);
            f.frames(5);
            meter.end();
            f.frames(4);
        }
        expect(frameTraces().get("open-shot")).toHaveLength(TRACES_PER_GESTURE);
    });

    it("records nothing for a finger that never moved", () => {
        const f = fakeFrames();
        setFrameMeter(true);
        const meter = meterGesture("page-drag", "tracked", f.win);
        f.frames(3);
        meter.end("spring");
        f.frames(4);
        expect(frameTraces().size).toBe(0);
    });

    it("takes its listener away and stops every loop when turned off", () => {
        const f = fakeFrames();
        setFrameMeter(true);
        meterGesture("page-drag", "tracked", f.win);
        expect(f.listenerCount()).toBeGreaterThan(0);
        setFrameMeter(false);
        expect(f.listenerCount()).toBe(0);
        expect(f.win.cancelAnimationFrame).toHaveBeenCalled();
    });

    it("never uses a global window, a timer or a performance mark", () => {
        expect(SOURCE).not.toMatch(/setInterval|performance\.mark|window\.|[^.]requestAnimationFrame\(/);
    });
});

describe("the frame meter, its edges (#826 review)", () => {
    afterEach(() => {
        setFrameMeter(false);
        clearFrameTraces();
    });

    it("judges a steadily slow motion by the screen's best refresh, never by its own", () => {
        setFrameMeter(true);
        const f = fakeFrames(1000 / 60);
        const smooth = meterGesture("open-shot", "clock", f.win);
        f.frames(20);
        smooth.end();
        f.frames(4);
        const slow = meterGesture("page-drag", "tracked", f.win);
        f.frames(2);
        slow.moved();
        f.frames(20, 2000 / 60);
        slow.end("turn");
        f.frames(4);
        const [kept] = frameTraces().get("page-drag:turn") ?? [];
        expect(kept.trace.refreshMs).toBeCloseTo(16.7, 0);
        expect(kept.verdict.pass).toBe(false);
    });

    it("keeps each window's inputs on its own clock", () => {
        setFrameMeter(true);
        const main = fakeFrames();
        const popout = fakeFrames();
        meterGesture("page-drag", "tracked", main.win);
        main.input("pointerdown");
        const meter = meterGesture("chapter-turn:leaf:clock", "clock", popout.win);
        popout.frames(10);
        meter.end();
        popout.frames(4);
        const [kept] = frameTraces().get("chapter-turn:leaf:clock") ?? [];
        expect(kept.verdict.inputToMotionMs).toBeGreaterThanOrEqual(0);
    });

    it("stops reading a motion nobody ended", () => {
        setFrameMeter(true);
        const f = fakeFrames();
        meterGesture("open-shot", "clock", f.win);
        f.frames(1300);
        const asked = f.win.requestAnimationFrame.mock.calls.length;
        f.frames(10);
        expect(f.win.requestAnimationFrame.mock.calls.length).toBe(asked);
    });
});
