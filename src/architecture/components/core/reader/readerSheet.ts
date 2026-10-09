import { MOTION } from "./readerMotion";

/**
 * **The bottom sheet** (#750 D5, FR-7, FR-20): the Reader's side panel, re-shaped for a reading taller
 * than it is wide. Pure: heights in px measured from the bottom of the reading, speeds in px/ms
 * (positive is up). The view drags it and settles it; the panels inside are unchanged — Contents,
 * Type, Around this chapter, and any later side panel (Alongside) open the same way.
 */

export interface SheetSnaps {
    /** Where it opens: half the reading. */
    half: number;
    /** Nearly all of it, below the status bar. */
    full: number;
}

export type SheetStop = "half" | "full" | "closed";

const HALF = 0.5;
const FULL = 0.92;
/** A release this fast is a flick: the sheet goes its way whatever its height. */
const FLICK_PX_PER_MS = 0.5;
/** Dragged below this share of the half height, the sheet closes when let go. */
const CLOSE_SHARE = 0.75;
/** How far ahead a release is projected before the nearest height is chosen. */
const PROJECT_MS = 120;

/** The sheet's two heights in a reading `height` tall, the top one kept below `safeTop`. */
export function sheetSnaps(height: number, safeTop: number): SheetSnaps {
    return { half: Math.round(height * HALF), full: Math.round(Math.min(height * FULL, height - safeTop)) };
}

/** The height under a finger that started on `from` and moved `dy` (down is positive): 1:1, softer past the top. */
export function dragSheet(from: number, dy: number, snaps: SheetSnaps): number {
    const height = from - dy;
    if (height > snaps.full) return snaps.full + (height - snaps.full) / 3;
    return Math.max(0, height);
}

/** Where a released sheet settles, from its height and the speed it was let go at. */
export function settleSheet(height: number, velocity: number, snaps: SheetSnaps): SheetStop {
    if (velocity <= -FLICK_PX_PER_MS) return "closed";
    if (velocity >= FLICK_PX_PER_MS) return "full";
    const projected = height + velocity * PROJECT_MS;
    if (projected < snaps.half * CLOSE_SHARE) return "closed";
    return Math.abs(projected - snaps.half) <= Math.abs(projected - snaps.full) ? "half" : "full";
}

/** How long the settle takes: the distance at the release speed, inside [fast, cover]. */
export function settleDuration(distance: number, velocity: number): number {
    const speed = Math.abs(velocity);
    const ms = speed > 0.05 ? Math.abs(distance) / speed : MOTION.base;
    return Math.round(Math.min(400, Math.max(MOTION.fast, ms)));
}
