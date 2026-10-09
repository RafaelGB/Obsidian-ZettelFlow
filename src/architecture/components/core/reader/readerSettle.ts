import { MOTION, motionWelcome } from "./readerMotion";

/**
 * **The camera stays still while the text settles** (#753 FR-14; constitution §XVI). After the chapter
 * takes a new shape — Scroll, Page or Spread; a font; a size — the line you were reading is put back
 * where your eyes are, and the blocks around it settle into place: a short fade and a small drift,
 * capped, on the compositor. The block you were reading never moves. Nothing lays out twice.
 *
 * #757 reuses it for the type's finer rows, quicker and fainter (`{ duration: MOTION.fast, fromOpacity: 0.85 }`).
 */

export interface SettleOptions {
    duration: number;
    /** Where the fade starts. */
    fromOpacity: number;
    /** The furthest a block drifts in from, whatever distance its line moved. */
    shiftCapPx: number;
}

/** A layout change: the shared beat, from a faint text, a drift of at most 8 px. */
export const LAYOUT_SETTLE: SettleOptions = { duration: MOTION.base, fromOpacity: 0.55, shiftCapPx: 8 };

/** The two frames of one block's settle, from where it was (`null`: it was not on screen) to where it is. */
export function settleFrames(oldTop: number | null, newTop: number, capPx: number, fromOpacity: number): Keyframe[] {
    const cap = Math.max(0, capPx);
    const shift = oldTop === null ? cap : Math.max(-cap, Math.min(cap, oldTop - newTop));
    return [
        { opacity: fromOpacity, translate: `0px ${Math.round(shift * 100) / 100}px` },
        { opacity: 1, translate: "0px 0px" },
    ];
}

/**
 * Settle `blocks` (the ones on screen after the change, with their tops before it) around `anchor`,
 * which stays exactly where it is. Nothing at all under reduced motion (FR-16).
 */
export function settleAround(anchor: Element | null, blocks: readonly { el: HTMLElement; oldTop: number | null }[], options: SettleOptions = LAYOUT_SETTLE): Animation[] {
    const animations: Animation[] = [];
    for (const { el, oldTop } of blocks) {
        if (el === anchor || !motionWelcome(el)) continue;
        const top = el.getBoundingClientRect().top;
        animations.push(el.animate(settleFrames(oldTop, top, options.shiftCapPx, options.fromOpacity), { duration: options.duration, easing: MOTION.ease }));
    }
    return animations;
}
