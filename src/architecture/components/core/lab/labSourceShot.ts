import { c } from "architecture";
import { flightTransform, MOTION, motionWelcome } from "architecture/components/core/reader/readerMotion";

/** What every thread and every head in the list is known by across a change, so it can move. */
export const LAB_KEY = "data-lab-key";

type Box = { left: number; top: number; width: number; height: number };

/** How far a card travels sideways as it leaves or arrives. A feel, on the 4-grid's scale. */
const SIDEWAYS = 32;

/** A shot that can be jumped to its end — any input during it does (§XVI, MF-9). */
export interface SourceShot {
    finish(): void;
}

export interface SourceShotOptions {
    /** The source's name, lifted off what you touched, flies into the find bar and becomes its chip (MF-1). */
    chip?: { from: HTMLElement; land: () => HTMLElement | null };
    /** Taking a source away plays the same shot backwards (MF-4). */
    reverse?: boolean;
}

const visible = (box: Box, view: Box) => box.top + box.height > view.top && box.top < view.top + view.height;

/**
 * **A filter change, as one continuous shot** (#874 MF-1–MF-11). Measure what is on screen, change the
 * list once, then: the cards the filter leaves out slide off to the side as ghosts, the ones that stay
 * move from where they were to where they are (FLIP), the ones that join slide in from the other side,
 * and the source's name flies into the find bar — one gesture, on the shared curve, `transform` and
 * `opacity` only, nothing but what is in view. Under reduced motion the change is simply made.
 */
export function playSourceShot(scroller: HTMLElement, list: HTMLElement, mutate: () => void, options: SourceShotOptions = {}): SourceShot | null {
    if (!motionWelcome(list)) {
        mutate();
        return null;
    }
    const view = scroller.getBoundingClientRect();
    const keyed = () => Array.from(list.querySelectorAll<HTMLElement>(`[${LAB_KEY}]`));
    const before = new Map<string, { box: Box; el: HTMLElement }>();
    for (const el of keyed()) {
        const key = el.getAttribute(LAB_KEY);
        if (!key || before.has(key)) continue;
        const box = el.getBoundingClientRect();
        if (visible(box, view)) before.set(key, { box, el: copyOf(el) });
    }
    const chipFrom = options.chip?.from.getBoundingClientRect();
    const chipGhost = options.chip ? (options.chip.from.cloneNode(true) as HTMLElement) : null;

    mutate();

    const animations: Animation[] = [];
    const away = options.reverse ? 1 : -1;
    const now = new Set<string>();
    for (const el of keyed()) {
        const key = el.getAttribute(LAB_KEY);
        if (!key) continue;
        now.add(key);
        const box = el.getBoundingClientRect();
        const was = before.get(key);
        if (was) {
            const dx = Math.round(was.box.left - box.left);
            const dy = Math.round(was.box.top - box.top);
            if (dx === 0 && dy === 0) continue;
            animations.push(el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0px, 0px)" }], { duration: MOTION.base, easing: MOTION.ease }));
        } else if (visible(box, view)) {
            animations.push(
                el.animate(
                    [
                        { transform: `translateX(${-away * SIDEWAYS}px)`, opacity: 0 },
                        { transform: "translateX(0px)", opacity: 1 },
                    ],
                    { duration: MOTION.base, easing: MOTION.ease }
                )
            );
        }
    }
    for (const [key, { box, el }] of before) {
        if (now.has(key)) continue;
        const ghost = placeGhost(scroller, el, box);
        const leave = ghost.animate(
            [
                { transform: "translateX(0px)", opacity: 1 },
                { transform: `translateX(${away * SIDEWAYS}px)`, opacity: 0 },
            ],
            { duration: MOTION.base, easing: MOTION.ease, fill: "forwards" }
        );
        leave.onfinish = () => ghost.remove();
        animations.push(leave);
    }
    const chip = options.chip?.land();
    if (chip && chipGhost && chipFrom) {
        // The chip is not there until the name lands on it: one picture, never two (MF-1).
        chip.addClass(c("lab-source-chip--landing"));
        const to = chip.getBoundingClientRect();
        const ghost = placeGhost(scroller, chipGhost, chipFrom);
        ghost.addClass(c("lab-source-chip-ghost"));
        // Carried, not stretched: the name keeps its size and lands where the chip begins.
        const landing = flightTransform(chipFrom, { left: to.left, top: to.top, width: chipFrom.width, height: chipFrom.height });
        const flight = ghost.animate([{ transform: "translate(0px, 0px) scale(1, 1)" }, { transform: landing }], {
            duration: MOTION.base,
            easing: MOTION.ease,
            fill: "forwards",
        });
        const land = () => {
            chip.removeClass(c("lab-source-chip--landing"));
            ghost.remove();
        };
        flight.onfinish = land;
        flight.oncancel = land;
        animations.push(flight);
    }
    return {
        finish: () => {
            for (const animation of animations) animation.finish();
        },
    };
}

/**
 * A card as it looks, copied: `cloneNode` leaves a text box's typed value behind, and a card's thought
 * lives in one — without this the card leaving would go as an empty box.
 */
function copyOf(el: HTMLElement): HTMLElement {
    const copy = el.cloneNode(true) as HTMLElement;
    const from = Array.from(el.querySelectorAll("textarea"));
    Array.from(copy.querySelectorAll("textarea")).forEach((area, index) => (area.value = from[index]?.value ?? ""));
    return copy;
}

/** A copy of what was on screen, where it was, in the scroller's own space — placed by custom properties. */
function placeGhost(scroller: HTMLElement, ghost: HTMLElement, box: Box): HTMLElement {
    const view = scroller.getBoundingClientRect();
    ghost.removeAttribute(LAB_KEY);
    ghost.addClass(c("lab-source-ghost"));
    ghost.setAttribute("aria-hidden", "true");
    // Out of the tab order and out of reach while it goes.
    ghost.setAttribute("inert", "");
    ghost.setCssProps({
        "--zf-ghost-x": `${Math.round(box.left - view.left + (scroller.scrollLeft || 0))}px`,
        "--zf-ghost-y": `${Math.round(box.top - view.top + (scroller.scrollTop || 0))}px`,
        "--zf-ghost-w": `${Math.round(box.width)}px`,
        "--zf-ghost-h": `${Math.round(box.height)}px`,
    });
    scroller.appendChild(ghost);
    return ghost;
}
