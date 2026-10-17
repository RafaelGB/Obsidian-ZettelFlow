/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest } from "@jest/globals";

/**
 * **A window whose frames a test advances** (#826): `requestAnimationFrame` callbacks run when the test
 * says a frame was shown, with the frame's timestamp, and `performance.now()` is that clock. Listeners
 * are recorded, so a test can fire an input with its own `timeStamp`, and count what was asked of it.
 */
export function fakeFrames(every = 1000 / 120) {
    let clock = 1000;
    let next = 1;
    const queue = new Map<number, (at: number) => void>();
    const listeners = new Map<string, Set<(event: any) => void>>();
    const win = {
        requestAnimationFrame: jest.fn((cb: (at: number) => void) => {
            const id = next++;
            queue.set(id, cb);
            return id;
        }),
        cancelAnimationFrame: jest.fn((id: number) => {
            queue.delete(id);
        }),
        addEventListener: jest.fn((name: string, fn: (event: any) => void) => {
            if (!listeners.has(name)) listeners.set(name, new Set());
            listeners.get(name)!.add(fn);
        }),
        removeEventListener: jest.fn((name: string, fn: (event: any) => void) => {
            listeners.get(name)?.delete(fn);
        }),
        performance: { now: () => clock },
        // Timers the gestures' own code keeps (a pager remembers its line): held, never run here.
        setTimeout: () => 0,
        clearTimeout: () => undefined,
    };
    return {
        win: win as any,
        /** Show `n` frames, `ms` apart (the screen's own interval by default). */
        frames(n: number, ms = every) {
            for (let i = 0; i < n; i++) {
                clock += ms;
                const due = [...queue.entries()];
                queue.clear();
                for (const [, cb] of due) cb(clock);
            }
        },
        /** Let time pass without a frame (a stall). */
        wait(ms: number) {
            clock += ms;
        },
        /** An input on the window, now. */
        input(name = "pointermove") {
            for (const fn of listeners.get(name) ?? []) fn({ timeStamp: clock });
        },
        listenerCount: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
        now: () => clock,
    };
}
