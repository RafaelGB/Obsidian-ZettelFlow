import { frameVerdict, refreshInterval, type FrameDrive, type FrameTrace, type FrameVerdict } from "./frameVerdict";

/**
 * **The frame meter** (#826, epic #827) — for developers, off by default, for this session only.
 *
 * A motion's frames on the device it runs on: an iPad has no developer tools a script can drive, so
 * the plugin times its own gestures — a page drag, a chapter turn, a shelf drag, the opening shot —
 * frame by frame, and judges each with `frameVerdict`, the same function the desktop's traces are
 * judged by. *Settings › Advanced* shows the verdicts. Nothing is saved; a restart turns it off.
 *
 * **Off, it costs nothing.** Every gesture asks for a handle, and off they all get the same do-nothing
 * one: no frame callback, no listener, no allocation. It follows `measure.ts`'s shape — module state, a
 * bounded store, no I/O — and it works on each gesture's own window: Settings is a pop-out of its own,
 * so the meter listens for input where a gesture happens, and reads the screen's refresh from the
 * motion's own frames (the lower half of its intervals: what the screen does when nothing drops).
 */

export interface GestureMeter {
    /** The finger moved past the slop: the motion it drives begins with the next frame. */
    moved(): void;
    /** Input asked the motion to stop (a key, a tap). */
    interrupted(): void;
    /** The motion is over; `outcome` names how (`turn`, `spring`) and keys the trace. */
    end(outcome?: string): void;
}

export interface MeteredTrace {
    trace: FrameTrace;
    verdict: FrameVerdict;
}

const NOOP: GestureMeter = Object.freeze({ moved() {}, interrupted() {}, end() {} });

/** Traces kept for each gesture: the last few — a history nobody reads is a leak with good manners. */
export const TRACES_PER_GESTURE = 5;
/** Frames still read after a motion ends: its last frame is shown after the call that ended it. */
const AFTER_END = 2;
/** An input this recent began the gesture; an older one did not. */
const INPUT_WINDOW_MS = 250;

type Win = Pick<Window, "requestAnimationFrame" | "cancelAnimationFrame" | "addEventListener" | "removeEventListener"> & { performance?: Performance };

/** A motion that never ends — a handle nobody ended — stops being read after this. */
const MAX_FRAMES = 1200;

let on = false;
let lastRefreshMs: number | null = null;
/** The best refresh seen this session: a steadily slow motion must never set its own bar. */
let bestRefreshMs = Number.POSITIVE_INFINITY;
const store = new Map<string, MeteredTrace[]>();
const running = new Set<() => void>();
/** Each window's own listener and its last input — each window keeps its own clock. */
const listening = new Map<Win, { listener: (event: Event) => void; last: number }>();
const INPUTS = ["pointerdown", "pointermove", "keydown", "click"] as const;

function now(win: Win): number {
    return (win.performance ?? performance).now();
}

function listen(win: Win): { listener: (event: Event) => void; last: number } {
    const known = listening.get(win);
    if (known) return known;
    const entry = { listener: (event: Event) => (entry.last = event.timeStamp), last: 0 };
    listening.set(win, entry);
    for (const name of INPUTS) win.addEventListener(name, entry.listener, { capture: true, passive: true });
    return entry;
}

/** Turn the meter on or off, for this session (#826 FR-3). Off, every listener and loop goes. */
export function setFrameMeter(enabled: boolean): void {
    if (enabled === on) return;
    on = enabled;
    if (enabled) return;
    for (const stop of [...running]) stop();
    running.clear();
    for (const [win, entry] of listening) for (const name of INPUTS) win.removeEventListener(name, entry.listener, { capture: true });
    listening.clear();
}

export function frameMeterOn(): boolean {
    return on;
}

/** The screen's refresh interval, as the last metered motion showed it — `null` before any. */
export function meteredRefreshMs(): number | null {
    return lastRefreshMs;
}

/**
 * A handle on one gesture's frames. Off — the usual case — the same do-nothing handle, every time.
 * `kind` keys the trace (`page-drag`, `chapter-turn:leaf:held`); `drive` is what the verdict's start rule
 * reads: a finger's gesture moves in the frame after the input, a clock's starts within 100 ms.
 */
export function meterGesture(kind: string, drive: FrameDrive, win: Win | undefined | null): GestureMeter {
    if (!on || !win) return NOOP;
    const inputs = listen(win);
    const recent = (at: number) => (inputs.last > 0 && at - inputs.last < INPUT_WINDOW_MS ? inputs.last : at);
    let input = recent(now(win));
    let moveFrom: number | null = drive === "clock" ? input : null;
    let firstMotion: number | null = null;
    const frames: number[] = [];
    // Every frame seen, the idle ones before a finger moves too: what the screen does when nothing drops.
    const ticks: number[] = [];
    let ended: number | null = null;
    let outcome: string | undefined;
    let after = 0;
    let interruptAt: number | null = null;
    let id = 0;
    const tick = (at: number) => {
        ticks.push(at);
        if (ticks.length > MAX_FRAMES) return finish();
        if (moveFrom !== null && at > moveFrom) {
            firstMotion ??= at;
            if (ended === null || at <= ended || after < AFTER_END) frames.push(at);
        }
        if (ended !== null && at >= ended && ++after > AFTER_END) return finish();
        id = win.requestAnimationFrame(tick);
    };
    const stop = () => win.cancelAnimationFrame(id);
    const finish = () => {
        running.delete(stop);
        if (frames.length < 2 || firstMotion === null) return;
        bestRefreshMs = Math.min(bestRefreshMs, refreshInterval(ticks.slice(1).map((at, i) => at - ticks[i])));
        const refreshMs = bestRefreshMs;
        lastRefreshMs = refreshMs;
        const trace: FrameTrace = {
            gesture: outcome ? `${kind}:${outcome}` : kind,
            drive,
            refreshMs,
            frames,
            input,
            firstMotion,
            // No browser says, in the page, when it laid out: not measured — never a pass of its own.
            layouts: null,
            ...(interruptAt !== null && ended !== null ? { interrupt: { input: interruptAt, end: ended } } : {}),
        };
        const kept = store.get(trace.gesture) ?? [];
        kept.push({ trace, verdict: frameVerdict(trace) });
        if (kept.length > TRACES_PER_GESTURE) kept.splice(0, kept.length - TRACES_PER_GESTURE);
        store.set(trace.gesture, kept);
    };
    running.add(stop);
    id = win.requestAnimationFrame(tick);
    return {
        moved() {
            if (moveFrom !== null) return;
            input = recent(now(win));
            moveFrom = input;
        },
        interrupted() {
            interruptAt ??= recent(now(win));
        },
        end(how?: string) {
            if (ended !== null) return;
            ended = now(win);
            outcome = how;
            if (moveFrom === null) {
                // A finger that never moved: no motion to judge.
                stop();
                running.delete(stop);
            }
        },
    };
}

/** Every gesture's last traces and their verdicts, in the order they were first seen. */
export function frameTraces(): ReadonlyMap<string, readonly MeteredTrace[]> {
    return store;
}

export function clearFrameTraces(): void {
    store.clear();
    lastRefreshMs = null;
    bestRefreshMs = Number.POSITIVE_INFINITY;
}
