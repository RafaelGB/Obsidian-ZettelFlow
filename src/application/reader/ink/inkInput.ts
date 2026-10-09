/**
 * **Who draws** (#745 E5, epic #740) — pure.
 *
 * With the palette open a pen draws and so does a mouse; a finger never does — it scrolls, turns and
 * taps as it always has (FR-2). While a pen is down, and for a moment after it lifts, a touch is a
 * palm resting on the glass and does nothing at all (FR-3). Two fingers tapped together, quickly and
 * barely moving, undo (FR-8); a pinch or a two-finger scroll never does.
 *
 * The thresholds are named here, once: the device walk on the iPad tunes them.
 */

/** A touch this soon after the pen lifted is the hand that held it. */
export const PALM_WINDOW_MS = 300;
/** The two fingers of a two-finger tap come down — and lift — within this of each other… */
export const TWO_TAP_SYNC_MS = 80;
/** …the whole tap takes no longer than this… */
export const TWO_TAP_MS = 250;
/** …and neither finger travels farther than this. */
export const TWO_TAP_SLOP_PX = 10;

export type InkRoute = "draw" | "explain" | "reject" | "pass";

/**
 * What a pointer going down on the page is: ink, an explanation (there is no thinking space to keep
 * ink in), a palm, or not ink's at all — which goes on to the page's own touch handling (R1).
 */
export function routePointer(input: {
    type: string;
    paletteOpen: boolean;
    labSet: boolean;
    /** Whether a pen is on the glass now. */
    penDown: boolean;
    /** When the pen last lifted, or `null`. */
    lastPenUpAt: number | null;
    now: number;
}): InkRoute {
    const { type, paletteOpen } = input;
    if (type === "touch") {
        if (!paletteOpen) return "pass";
        if (input.penDown) return "reject";
        if (input.lastPenUpAt !== null && input.now - input.lastPenUpAt <= PALM_WINDOW_MS) return "reject";
        return "pass";
    }
    if (!paletteOpen || (type !== "pen" && type !== "mouse")) return "pass";
    return input.labSet ? "draw" : "explain";
}

/** One finger of a gesture: where and when it came down and lifted, and how far it went meanwhile. */
export interface FingerTrace {
    down: { x: number; y: number; t: number };
    up: { x: number; y: number; t: number };
    /** The farthest it went from where it came down. */
    travel: number;
}

/** Two fingers tapped together: down together, up together, quickly, barely moving (FR-8, AC-8). */
export function twoFingerTap(trace: readonly FingerTrace[]): boolean {
    if (trace.length !== 2) return false;
    const [a, b] = trace;
    if (Math.abs(a.down.t - b.down.t) > TWO_TAP_SYNC_MS) return false;
    if (Math.abs(a.up.t - b.up.t) > TWO_TAP_SYNC_MS) return false;
    if (Math.max(a.up.t, b.up.t) - Math.min(a.down.t, b.down.t) > TWO_TAP_MS) return false;
    const moved = (f: FingerTrace) => Math.max(f.travel, Math.hypot(f.up.x - f.down.x, f.up.y - f.down.y));
    return moved(a) <= TWO_TAP_SLOP_PX && moved(b) <= TWO_TAP_SLOP_PX;
}

/** The pen's altitude from what the event reports: `altitudeAngle` where it exists, else the tilts. */
export function altitudeOf(event: { altitudeAngle?: number; tiltX?: number; tiltY?: number }): number {
    if (typeof event.altitudeAngle === "number" && Number.isFinite(event.altitudeAngle)) return event.altitudeAngle;
    const tx = ((event.tiltX ?? 0) * Math.PI) / 180;
    const ty = ((event.tiltY ?? 0) * Math.PI) / 180;
    if (tx === 0 && ty === 0) return Math.PI / 2;
    return Math.PI / 2 - Math.atan(Math.hypot(Math.tan(tx), Math.tan(ty)));
}
