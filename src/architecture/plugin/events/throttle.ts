/**
 * Per-binding-per-note throttle (#150). Event-driven *runs* are heavier than the property-hook
 * debounce (60 ms), so a burst of vault events — a sync, a bulk edit, a folder import — collapses to
 * at most one run per key per window (maintainer decision OQ-4). The clock is injected (`nowMs`) so
 * the gate is pure and unit-testable without real timers. Key composition (flow + node + note) is the
 * caller's job; the gate only sees an opaque string key.
 */

/** Default throttle window, in seconds. */
export const THROTTLE_WINDOW_SECONDS = 2;

export class ThrottleGate {
    private readonly windowMs: number;
    private readonly lastFired = new Map<string, number>();

    constructor(windowMs: number = THROTTLE_WINDOW_SECONDS * 1000) {
        this.windowMs = windowMs;
    }

    /**
     * Whether a fire is allowed for `key` at `nowMs`. When it returns `true` the fire is recorded, so
     * subsequent calls within `windowMs` return `false` until the window elapses.
     */
    shouldFire(key: string, nowMs: number): boolean {
        const last = this.lastFired.get(key);
        if (last !== undefined && nowMs - last < this.windowMs) return false;
        this.lastFired.set(key, nowMs);
        return true;
    }

    /** Forget throttle state (all keys, or one). Used when the engine disarms. */
    reset(key?: string): void {
        if (key === undefined) this.lastFired.clear();
        else this.lastFired.delete(key);
    }
}
