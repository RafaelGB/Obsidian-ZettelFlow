import { MOTION, motionWelcome } from "architecture/components/core/reader/readerMotion";

/** The attribute a card is known by across a redraw. */
export const FLIP_KEY = "data-shelf-id";

type Box = { left: number; top: number };

/**
 * **A card that changes row, moved** (#743 FR-16): measure every card, redraw, then carry each one
 * from where it was to where it is now by a translate — the card you changed leaves its row and
 * arrives in its new one, the others close the gap. First, last, invert, play: only `transform`
 * moves, on the shared curve, and under reduced motion the redraw is simply instant.
 */
export function flipMove(container: HTMLElement, mutate: () => void): void {
    if (!motionWelcome(container)) {
        mutate();
        return;
    }
    const before = new Map<string, Box>();
    for (const el of Array.from(container.querySelectorAll<HTMLElement>(`[${FLIP_KEY}]`))) {
        const id = el.getAttribute(FLIP_KEY);
        if (id && !before.has(id)) before.set(id, el.getBoundingClientRect());
    }
    mutate();
    for (const el of Array.from(container.querySelectorAll<HTMLElement>(`[${FLIP_KEY}]`))) {
        const from = before.get(el.getAttribute(FLIP_KEY) ?? "");
        if (!from) continue;
        const to = el.getBoundingClientRect();
        const dx = Math.round(from.left - to.left);
        const dy = Math.round(from.top - to.top);
        if (dx === 0 && dy === 0) continue;
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0px, 0px)" }], {
            duration: MOTION.base,
            easing: MOTION.ease,
        });
    }
}

/** A chip arriving in its row (#743 FR-16): from a touch smaller and clear, to itself. */
export function dropIn(el: HTMLElement): void {
    if (!motionWelcome(el)) return;
    el.animate(
        [
            { opacity: 0, transform: "scale(0.96)" },
            { opacity: 1, transform: "scale(1)" },
        ],
        { duration: MOTION.fast, easing: MOTION.ease }
    );
}

/**
 * A card arriving in *Recently added* while the shelf is open (#744 FR-13): it settles into its row
 * from a touch smaller and clear, on the shared curve — the cards beside it make room by
 * {@link flipMove}. Under reduced motion it is simply there.
 */
export function arriveIn(el: HTMLElement): void {
    if (!motionWelcome(el)) return;
    el.animate(
        [
            { opacity: 0, transform: "scale(0.96)" },
            { opacity: 1, transform: "scale(1)" },
        ],
        { duration: MOTION.base, easing: MOTION.ease }
    );
}
