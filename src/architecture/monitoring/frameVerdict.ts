/**
 * **Whether a gesture held its frames** (#826, epic #827) — pure, and nothing imported.
 *
 * A motion is smooth or it is not, and that should be a number, not an impression. The device only
 * supplies data — when each frame was shown, when the input came, when the page laid out — and this
 * decides, the same way on a desktop trace and on an iPad's frame meter, so jest can prove the verdict
 * and the device never has to.
 *
 * An interval is counted **in refreshes** (`Math.round(interval / refreshMs)`): a vsync's jitter, 8.0
 * to 8.7 ms at 120 Hz, is one frame, not a drop. A frame is on time at one refresh; a long frame is
 * one of more than two.
 */

/** What a gesture is driven by: a finger the page must follow, or a clock that plays a motion. */
export type FrameDrive = "tracked" | "clock";

export interface FrameTrace {
    /** Which gesture, and how (`page-drag:turn`, `chapter-turn:leaf:held`, `open-shot`). */
    gesture: string;
    drive: FrameDrive;
    /** The screen's refresh interval, measured (a WKWebView may draw at 60 Hz on a 120 Hz panel). */
    refreshMs: number;
    /** When each frame of the motion was shown, ms, from its first moving frame to its last. */
    frames: number[];
    /** When the input that began it came: the click, the key, the first move past the slop. */
    input: number;
    /** When the first frame that moved was shown. */
    firstMotion: number;
    /** When the page laid out during the motion — `null` where the device cannot say. */
    layouts: number[] | null;
    /** Style recalculations: a finger-driven motion is one by definition, so reported, never gated. */
    styleRecalcs?: number;
    /** A motion stopped by input (a key, a tap): when the input came, and its last frame. */
    interrupt?: { input: number; end: number };
}

export type FrameFailure = "budget" | "long-frame" | "start" | "layout" | "interrupt";

export interface FrameVerdict {
    gesture: string;
    frames: number;
    p95Ms: number;
    worstMs: number;
    /** The share of intervals shown on time: one refresh. */
    onTimeShare: number;
    /** How many intervals took more than two refreshes. */
    overTwo: number;
    inputToMotionMs: number;
    /** Frames shown between the input and the first that moved. */
    framesBeforeMotion: number;
    /** `null`: not measurable on this device — never counted as a pass of its own. */
    layoutInGesture: boolean | null;
    layoutsAt: number[];
    styleRecalcs?: number;
    /** Frames from an interrupting input to the motion's end. */
    interruptFrames?: number;
    pass: boolean;
    failures: FrameFailure[];
}

/** The thresholds (#826, open question 2): one constant, so a decision changes one line. */
export const SMOOTH = {
    /** At least this share of a motion's intervals on time. */
    onTime: 0.95,
    /** No interval of more than this many refreshes. */
    maxRefreshes: 2,
    /** A motion the clock plays starts within this — the page's own work before it moves. */
    clockStartMs: 100,
} as const;

function percentile(sorted: number[], share: number): number {
    if (sorted.length === 0) return 0;
    const at = Math.min(sorted.length - 1, Math.max(0, Math.ceil(share * sorted.length) - 1));
    return sorted[at];
}

/**
 * The screen's refresh interval from idle frames: the median of their lower half, so a frame the
 * page skipped while idle does not make the screen look slower than it is.
 */
export function refreshInterval(intervals: number[]): number {
    const sorted = intervals.filter((ms) => ms > 0 && Number.isFinite(ms)).sort((a, b) => a - b);
    if (sorted.length === 0) return 1000 / 60;
    const lower = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)));
    return lower[Math.floor((lower.length - 1) / 2)];
}

/** The verdict on one gesture's frames (#826 FR-4). */
export function frameVerdict(trace: FrameTrace): FrameVerdict {
    const refresh = trace.refreshMs > 0 ? trace.refreshMs : 1000 / 60;
    const intervals: number[] = [];
    for (let i = 1; i < trace.frames.length; i++) intervals.push(trace.frames[i] - trace.frames[i - 1]);
    const counts = intervals.map((ms) => Math.max(1, Math.round(ms / refresh)));
    const sorted = [...intervals].sort((a, b) => a - b);
    const onTime = counts.filter((n) => n === 1).length;
    const overTwo = counts.filter((n) => n > SMOOTH.maxRefreshes).length;
    const onTimeShare = intervals.length === 0 ? 1 : onTime / intervals.length;
    const framesBeforeMotion = Math.max(0, Math.round((trace.firstMotion - trace.input) / refresh) - 1);
    const start = trace.frames[0] ?? trace.firstMotion;
    const end = trace.frames[trace.frames.length - 1] ?? trace.firstMotion;
    const layoutsAt = trace.layouts ? trace.layouts.filter((at) => at >= start && at <= end) : [];
    const layoutInGesture = trace.layouts === null ? null : layoutsAt.length > 0;
    const interruptFrames = trace.interrupt ? Math.max(0, Math.round((trace.interrupt.end - trace.interrupt.input) / refresh)) : undefined;

    const failures: FrameFailure[] = [];
    if (onTimeShare < SMOOTH.onTime) failures.push("budget");
    if (overTwo > 0) failures.push("long-frame");
    const lateStart = trace.drive === "tracked" ? framesBeforeMotion > 0 : trace.firstMotion - trace.input > SMOOTH.clockStartMs;
    if (lateStart) failures.push("start");
    if (layoutInGesture === true) failures.push("layout");
    if (interruptFrames !== undefined && interruptFrames > 1) failures.push("interrupt");

    return {
        gesture: trace.gesture,
        frames: trace.frames.length,
        p95Ms: percentile(sorted, 0.95),
        worstMs: sorted[sorted.length - 1] ?? 0,
        onTimeShare,
        overTwo,
        inputToMotionMs: trace.firstMotion - trace.input,
        framesBeforeMotion,
        layoutInGesture,
        layoutsAt,
        ...(trace.styleRecalcs === undefined ? {} : { styleRecalcs: trace.styleRecalcs }),
        ...(interruptFrames === undefined ? {} : { interruptFrames }),
        pass: failures.length === 0,
        failures,
    };
}
