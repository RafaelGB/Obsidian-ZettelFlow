import { c } from "architecture";
import { fly, motionWelcome } from "architecture/components/core/reader/readerMotion";
import type { SystemDrawing } from "../systemDrawing";
import { armSkip, ownWindow, settledWithin } from "./communityPan";
import { drawSystem } from "./systemDrawingView";

/**
 * **The Systems room's shots** (#799 FR-7, FR-13; §XVI one continuous shot).
 *
 * The card's drawing grows into the stage; on Install the stage's drawing grows to fill the tab, and
 * the tab becomes the canvas; Obsidian's *Back* plays it the other way, onto the card. One moving
 * element per shot — a ghost of the drawing, flown by the Reader's `fly()` with `land: "become"`, so
 * the real thing appears in the frame the ghost goes. Any key or press jumps a shot to its end, a
 * timeout settles it whatever the animation does, and under reduced motion every shot is a cut.
 */

/** Durations, in milliseconds. */
export const SHOT = {
    /** The card's drawing onto the stage. */
    open: 560,
    /** The stage's drawing home onto its card. */
    close: 480,
    /** The stage's drawing filling the tab, which becomes the canvas. */
    land: 700,
    /** Back from the canvas: the tab's drawing onto its card. */
    home: 600,
    /** The dot along an edge, and the camera onto the next step. */
    walk: 650,
    frame: 700,
} as const;

export interface Box {
    left: number;
    top: number;
    width: number;
    height: number;
}

export function boxOf(el: Element): Box {
    const rect = el.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function finishAll(animations: Animation[]): void {
    for (const animation of animations) {
        try {
            animation.finish();
        } catch {
            // Already gone.
        }
    }
}

/** Wait for these to land — input jumps them to their end — and never longer than their length and a beat. */
export async function play(el: HTMLElement, animations: (Animation | null)[], duration: number): Promise<void> {
    const live = animations.filter((animation): animation is Animation => Boolean(animation));
    if (live.length === 0) return;
    const win = ownWindow(el);
    const stop = armSkip(win, () => finishAll(live));
    try {
        await settledWithin(win, live, duration + 300);
    } finally {
        stop();
    }
}

/**
 * A ghost of the drawing, flown from one box onto another, drawn at the size of the bigger of the
 * two so its lines land crisp. `landed` shows the real thing; it runs exactly once, at the latest
 * when the shot's patience runs out.
 */
export async function flyDrawing(host: HTMLElement, drawing: SystemDrawing, from: Box, to: Box, duration: number, landed: () => void): Promise<void> {
    let done = false;
    const land = () => {
        if (done) return;
        done = true;
        landed();
    };
    if (!motionWelcome(host) || from.width <= 0 || to.width <= 0) {
        land();
        return;
    }
    const ghost = host.createDiv({ cls: c("system-ghost"), attr: { "aria-hidden": "true" } });
    drawSystem(ghost, drawing, "full");
    const grown = to.width * to.height >= from.width * from.height;
    const flight = fly(host, ghost, from, to, { duration, grown, land: "become", onLanded: land });
    await play(host, [flight], duration);
    land();
}
