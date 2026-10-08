import { c } from "architecture";

/**
 * Motion in the Reader and the Library (#724, epic #723): small moments that say where something
 * came from and where it went — and never cost a frame. The same tokens as `styles/utils/motion.scss`.
 * Everything here animates transform and opacity only, with the Web Animations API, and does nothing
 * at all under reduced motion or where the API is missing.
 */
export const MOTION = {
    fast: 120,
    base: 250,
    cover: 400,
    /** The opening shot (#734): the push into the book, then the cover opening and the landing. */
    shotPush: 450,
    shotLand: 700,
    /** The closing shot, the same move backwards in one gesture. */
    shotClose: 950,
    /** A chapter turning (#735): a leaf or a sheet; the flowing text is a touch quicker. */
    turn: 650,
    turnFlow: 600,
    /** How long a shot waits for the other view before it lets go. */
    shotPatience: 3000,
    ease: "cubic-bezier(0.22, 1, 0.36, 1)",
} as const;

type Box = { left: number; top: number; width: number; height: number };

function ownWindow(el: HTMLElement): Window {
    return (el as HTMLElement & { win?: Window }).win ?? window;
}

/** Whether motion is welcome here: not under reduced motion, and only where it can be played. */
export function motionWelcome(el: HTMLElement): boolean {
    if (typeof (el as { animate?: unknown }).animate !== "function") return false;
    return ownWindow(el).matchMedia?.("(prefers-reduced-motion: reduce)").matches !== true;
}

/** The transform that carries a box onto another: a translation and a scale from its top-left. */
export function flightTransform(from: Box, to: Box): string {
    const sx = from.width > 0 ? to.width / from.width : 1;
    const sy = from.height > 0 ? to.height / from.height : 1;
    const round = (n: number) => Math.round(n * 1000) / 1000;
    return `translate(${round(to.left - from.left)}px, ${round(to.top - from.top)}px) scale(${round(sx)}, ${round(sy)})`;
}

/**
 * A ghost of `from`, flown onto `to` and gone: drawn in `host`, placed by custom properties (never an
 * inline style), animated by transform and opacity, removed at the end — or after a moment, whatever
 * happens to the animation.
 */
export function fly(host: HTMLElement, ghost: HTMLElement, from: Box, to: Box, options: { duration: number; startOpacity?: number }): void {
    const box = host.getBoundingClientRect();
    ghost.addClass(c("motion-ghost"));
    ghost.setCssProps({
        "--zf-ghost-x": `${Math.round(from.left - box.left)}px`,
        "--zf-ghost-y": `${Math.round(from.top - box.top)}px`,
        "--zf-ghost-w": `${Math.round(from.width)}px`,
        "--zf-ghost-h": `${Math.round(from.height)}px`,
    });
    host.appendChild(ghost);
    const done = () => ghost.remove();
    const animation = ghost.animate(
        [
            { transform: "translate(0px, 0px) scale(1, 1)", opacity: options.startOpacity ?? 1 },
            { opacity: options.startOpacity ?? 1, offset: 0.7 },
            { transform: flightTransform(from, to), opacity: 0 },
        ],
        { duration: options.duration, easing: MOTION.ease, fill: "forwards" }
    );
    animation.onfinish = done;
    ownWindow(host).setTimeout(done, options.duration + 300);
}
