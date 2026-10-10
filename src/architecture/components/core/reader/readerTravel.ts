import { MOTION } from "./readerMotion";

/**
 * **Going to a place is a camera move, never a cut** (#761 FR-15; constitution §XVI). Pure.
 *
 * A jump, its way back, a search hit, a bookmark, a passage from Think: in *Page* and *Spread* the
 * strip travels to the screen that holds the place; in *Scroll* the column glides there. The travel is
 * proportional to the distance and capped: a far place is not reached by animating dozens of pages
 * past the eye, but by sliding the last few with an ease-out — the travel is compressed, and the first
 * frame is a little faint so the compression reads as speed, not as a cut. Under reduced motion every
 * travel is instant (the view never asks for one).
 */

/** The most screens a travel slides past in *Page* and *Spread*; a farther one is compressed to these. */
export const TRAVEL_PAGES = 3;
/** The most screens a glide covers in *Scroll*. */
export const TRAVEL_SCREENS = 2;
/** Each screen past the first adds this much to the travel. */
export const TRAVEL_STEP_MS = 60;
/** Where a compressed travel's fade starts: faint enough to read as speed. */
export const TRAVEL_FAINT = 0.6;

export interface Travel {
    /** Where the slide starts: a screen (pages) or an offset in px from the place (scroll). */
    from: number;
    /** How many screens it covers. */
    steps: number;
    /** Farther than the cap: it starts closer, and faint. */
    compressed: boolean;
    duration: number;
}

/** How long a travel of `steps` screens takes: a page turn's beat, a little more per screen, capped. */
export function travelDuration(steps: number, compressed = false): number {
    if (compressed) return MOTION.shotPush;
    const ms = MOTION.page + TRAVEL_STEP_MS * (Math.max(0, steps) - 1);
    return Math.round(Math.min(MOTION.shotPush, Math.max(MOTION.base, ms)));
}

/** A travel from screen `from` to screen `to` in pages: the last `TRAVEL_PAGES` of it, at most. */
export function pageTravel(from: number, to: number, max = TRAVEL_PAGES): Travel {
    const distance = Math.abs(to - from);
    const compressed = distance > max;
    const start = compressed ? to - Math.sign(to - from) * max : from;
    const steps = Math.min(distance, max);
    return { from: start, steps, compressed, duration: travelDuration(steps, compressed) };
}

/**
 * A glide in a scroll of `distance` px (the scroll moved by it), over a screen `screen` px tall: the
 * page starts `from` px away from where it lands — exactly where it was, unless that is farther than
 * `TRAVEL_SCREENS` screens, then that far, faint.
 */
export function scrollTravel(distance: number, screen: number, max = TRAVEL_SCREENS): Travel {
    const height = screen > 0 ? screen : 1;
    const cap = max * height;
    const compressed = Math.abs(distance) > cap;
    const from = compressed ? Math.sign(distance) * cap : distance;
    const steps = Math.abs(from) / height;
    return { from, steps, compressed, duration: travelDuration(steps, compressed) };
}
