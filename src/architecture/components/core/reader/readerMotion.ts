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

/** A cover clicked on the shelf, waiting for the Reader to open on it (#724). */
interface CoverFlight {
    rect: Box;
    cover: HTMLElement;
    at: number;
}

let pending: CoverFlight | null = null;

/** The Library hands over the cover you clicked. */
export function setCoverFlight(cover: HTMLElement | null): void {
    if (!cover) {
        pending = null;
        return;
    }
    const rect = cover.getBoundingClientRect();
    pending = rect.width > 0 ? { rect, cover, at: Date.now() } : null;
}

/** The Reader takes it once, and only while it is fresh: a cover from a minute ago flies nowhere. */
export function takeCoverFlight(): CoverFlight | null {
    const flight = pending;
    pending = null;
    return flight && Date.now() - flight.at < 2000 ? flight : null;
}

/**
 * Where the cover lands: its own shape (one scale for both sides — stretched to the page it read as
 * a smear), a little larger, centred on the reading column near its top, where the text appears.
 */
export function coverLanding(cover: Box, column: Box): Box {
    const scale = Math.min(1.5, (column.width / 3) / cover.width, (column.height * 0.6) / cover.height);
    const width = cover.width * scale;
    const height = cover.height * scale;
    return {
        left: column.left + column.width / 2 - width / 2,
        top: column.top + Math.min(column.height - height, column.height * 0.12),
        width,
        height,
    };
}

/**
 * The cover you clicked opens into the page: it lifts towards the column keeping its shape, then
 * gives way to the text, which fades in beneath it. One gesture — the Reader's own entrance is held
 * back while it plays (`reader--from-cover`), so nothing else moves at the same time.
 * Returns whether it played.
 */
export function playCoverFlight(host: HTMLElement, column: HTMLElement): boolean {
    const flight = takeCoverFlight();
    if (!flight || !motionWelcome(host)) return false;
    const box = column.getBoundingClientRect();
    if (!(box.width > 0)) return false;
    const ghost = flight.cover.cloneNode(true) as HTMLElement;
    const to = coverLanding(flight.rect, box);
    const hostBox = host.getBoundingClientRect();
    ghost.addClass(c("motion-ghost"), c("motion-cover"));
    ghost.setCssProps({
        "--zf-ghost-x": `${Math.round(flight.rect.left - hostBox.left)}px`,
        "--zf-ghost-y": `${Math.round(flight.rect.top - hostBox.top)}px`,
        "--zf-ghost-w": `${Math.round(flight.rect.width)}px`,
        "--zf-ghost-h": `${Math.round(flight.rect.height)}px`,
    });
    host.appendChild(ghost);
    host.addClass(c("reader--from-cover"));
    // The class stays until the next chapter: taking it off now would restart the page's own entrance.
    const done = () => ghost.remove();
    const duration = MOTION.cover + 100;
    // Two timelines: the move eases out (most of it early, settling gently), while the fade keeps
    // linear time — the cover stays whole until well past halfway, then gives way. Under one easing
    // the fade started almost at once and the cover looked washed out all the way.
    ghost.animate([{ transform: "translate(0px, 0px) scale(1, 1)" }, { transform: flightTransform(flight.rect, to) }], {
        duration,
        easing: MOTION.ease,
        fill: "forwards",
    });
    const fade = ghost.animate([{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration, easing: "linear", fill: "forwards" });
    fade.onfinish = done;
    (host as HTMLElement & { win?: Window }).win?.setTimeout(done, MOTION.cover + 500);
    return true;
}
