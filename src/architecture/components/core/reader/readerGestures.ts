import { c } from "architecture";
import { touchPointer } from "./readerDevice";

/**
 * **One touch on the page** (#750, epic #739; FR-1–FR-4): pure, fed by pointer samples. A gesture is
 * decided early as a tap, a swipe, a scroll or a long press, and stays that — a diagonal drag never
 * both scrolls and turns. The view wires the events; this module only decides. #761 (the trail) reads
 * the same classifier for its back-swipe.
 *
 * The numbers are named here, once. The ones a device decides (the edge zone, the back-swipe) are
 * provisional until the device walk on issue #750 confirms them.
 */

/** Movement under this is still a press in place. */
export const SLOP_PX = 10;
/** Held this long without moving: a long press, left to the system's own selection. */
export const LONG_PRESS_MS = 500;
/** A tap is lifted inside the slop within this time. */
export const TAP_MS = 300;
/** Mostly sideways — `|dx| > LOCK_RATIO·|dy|` — is a swipe; anything else a scroll. */
export const LOCK_RATIO = 1.2;
/** The outer fifth of the stage on each side turns a screen (FR-1). Device walk: "edge zone". */
export const EDGE_SHARE = 0.2;
/** A touch that starts this close to the screen's edge is iPadOS's and Obsidian's, never ours (FR-3). */
export const SYSTEM_EDGE_PX = 20;
/** A release this fast (px/ms) in the swipe's direction completes the turn, however short. */
export const FLICK_PX_PER_MS = 0.5;
/** The finger's share the page follows at the ends of the book (FR-18). */
export const RUBBER_BAND = 1 / 3;
/** The velocity is read over the last moment of the drag, not the whole of it. */
const VELOCITY_WINDOW_MS = 50;
/**
 * The trail's back-swipe from the left system strip (#761 FR-10). Off for good: the T0 audit and the
 * #750 walk showed the strip is Obsidian's (its drawer opens from there), so #761 goes back with two
 * fingers instead (`twoFingerBack`).
 */
export const EDGE_BACK_SWIPE = false;
/** How far two fingers sweep right to go back one step along the trail (#761 FR-10). */
export const BACK_SWIPE_PX = 60;

export interface PointerSample {
    x: number;
    y: number;
    /** Milliseconds, from the event's `timeStamp`. */
    t: number;
}

export type GestureKind = "pending" | "tap" | "swipe" | "scroll" | "press" | "none";
export type EdgeZone = "back" | "middle" | "forward";

/** What a gesture is so far, from where it started to where the finger is (and whether it lifted). */
export function classify(start: PointerSample, now: PointerSample, lifted: boolean): GestureKind {
    const dx = now.x - start.x;
    const dy = now.y - start.y;
    const dt = now.t - start.t;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SLOP_PX) {
        if (dt >= LONG_PRESS_MS) return "press";
        if (!lifted) return "pending";
        return dt <= TAP_MS ? "tap" : "none";
    }
    return Math.abs(dx) > LOCK_RATIO * Math.abs(dy) ? "swipe" : "scroll";
}

/** One gesture in progress. Its kind locks the first time it is more than `pending` (FR-4). */
export interface Gesture {
    readonly start: PointerSample;
    readonly kind: GestureKind;
    /** How far the finger is from where it started. */
    readonly dx: number;
    readonly dy: number;
    /** The horizontal speed at the last sample, in px/ms. */
    readonly vx: number;
    update(sample: PointerSample): GestureKind;
    end(sample: PointerSample): GestureKind;
}

interface PointerLike {
    pointerType?: string;
    clientX: number;
    clientY: number;
    timeStamp: number;
}

/**
 * A gesture begins — or `null` when it is not ours: a mouse or a trackpad (desktop is unchanged), or
 * a touch inside the system strip at either edge of the screen (`viewportWidth` wide).
 */
export function startGesture(event: PointerLike, viewportWidth: number): Gesture | null {
    if (!touchPointer(event)) return null;
    const x = event.clientX;
    if (x < SYSTEM_EDGE_PX || (viewportWidth > 0 && x > viewportWidth - SYSTEM_EDGE_PX)) return null;
    const start: PointerSample = { x, y: event.clientY, t: event.timeStamp };
    let kind: GestureKind = "pending";
    let last = start;
    let recent: PointerSample[] = [start];
    const feed = (sample: PointerSample, lifted: boolean): GestureKind => {
        last = sample;
        recent = [...recent.filter((s) => sample.t - s.t <= VELOCITY_WINDOW_MS), sample];
        // Decided once: whatever the finger does after, the gesture stays what it was first seen as.
        if (kind === "pending") kind = classify(start, sample, lifted);
        return kind;
    };
    return {
        start,
        get kind() {
            return kind;
        },
        get dx() {
            return last.x - start.x;
        },
        get dy() {
            return last.y - start.y;
        },
        get vx() {
            const first = recent[0];
            const dt = last.t - first.t;
            return dt > 0 ? (last.x - first.x) / dt : 0;
        },
        update: (sample) => feed(sample, false),
        end: (sample) => feed(sample, true),
    };
}

/** Where on the stage a tap landed: the outer fifth on each side, or the middle. */
export function edgeZone(x: number, stage: { left: number; width: number }): EdgeZone {
    if (!(stage.width > 0)) return "middle";
    const share = (x - stage.left) / stage.width;
    if (share < EDGE_SHARE) return "back";
    if (share > 1 - EDGE_SHARE) return "forward";
    return "middle";
}

/** What a tap on it is that thing, never a turn: a link, a mark, a footnote, a control, a popover. */
const THINGS = [
    "a",
    "button",
    "sup",
    "input",
    "textarea",
    "select",
    "label",
    `mark.${c("reader-highlight")}`,
    `.${c("reader-note-pop")}`,
    `.${c("reader-hl-pop")}`,
    `.${c("reader-peek")}`,
    `.${c("reader-panel")}`,
    `.${c("reader-search")}`,
].join(", ");

/** A tap on something does what it does today — and so does any tap while words are selected (FR-2). */
export function isThing(target: Element | null, hasSelection: boolean): boolean {
    if (hasSelection) return true;
    return Boolean(target?.closest?.(THINGS));
}

/** A released swipe: completed past a third of the width or on a flick its way, sprung back otherwise. */
export function releaseTurn(release: { dx: number; width: number; vx: number }): "complete" | "spring" {
    const { dx, width, vx } = release;
    if (dx === 0 || !(width > 0)) return "spring";
    const flick = Math.abs(vx) >= FLICK_PX_PER_MS;
    if (flick && Math.sign(vx) !== Math.sign(dx)) return "spring";
    return flick || Math.abs(dx) > width / 3 ? "complete" : "spring";
}

/** At the ends of the book the page follows a third of the finger. */
export function rubberBand(dx: number): number {
    return dx * RUBBER_BAND;
}

/**
 * The playback rate that finishes a turn at the speed it was released: the page's own pace across
 * `width` in `duration` ms is rate 1; never slower than that, nor more than three times it.
 */
export function completionRate(progress: number, vx: number, width: number, duration: number): number {
    if (!(width > 0) || !(duration > 0) || progress >= 1) return 1;
    const rate = (Math.abs(vx) * duration) / width;
    return Math.min(3, Math.max(1, rate));
}

/**
 * Two fingers swept right, together and mostly sideways (#761 FR-10): back one step along the trail.
 * The left edge strip is Obsidian's, and one finger is the page's turn, so the way back is two fingers
 * anywhere on the page — what each finger moved, from where it came down to where it lifted.
 */
export function twoFingerBack(moves: readonly { dx: number; dy: number }[]): boolean {
    return moves.length >= 2 && moves.every((move) => move.dx >= BACK_SWIPE_PX && move.dx > LOCK_RATIO * Math.abs(move.dy));
}
