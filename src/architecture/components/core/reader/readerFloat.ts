import { Component } from "obsidian";
import { c } from "architecture";
import { MOTION, motionWelcome } from "./readerMotion";

/**
 * **A panel grown from what asked for it** (#768 Cite, #842 Share): the one way the Reader and the
 * Library float a small panel over what you are reading. It is not a modal — no backdrop, the page
 * stays — and Esc or a click anywhere else puts it away, shrinking back to where it came from. Grown
 * and shrunk on the compositor (transform and opacity), and not at all under reduced motion.
 */

/** A box on screen: where a panel was asked from. */
export type FloatBox = { left: number; top: number; width: number; height: number };

export interface Floating {
    el: HTMLElement;
    scope: Component;
    gone: boolean;
}

/** The panel's least distance from the edges of what it floats over. */
const GAP_PX = 8;

/**
 * A panel in `host`, put away by `away` on Esc or a click outside it — unless `busy` says it is in the
 * middle of something, when only its own controls may close it.
 */
export function openFloating(host: HTMLElement, cls: string, label: string, away: () => void, busy: () => boolean = () => false): Floating {
    const el = host.createDiv({ cls: c(cls), attr: { role: "region", "aria-label": label } });
    const scope = new Component();
    scope.load();
    // A click inside is not a new selection in the chapter, nor a click outside the panel.
    scope.registerDomEvent(el, "mousedown", (event: MouseEvent) => event.stopPropagation());
    // Caught on the way down: a pane that keeps its own clicks to itself still puts it away.
    const outside = (event: MouseEvent) => {
        if (!busy() && !el.contains(event.target as Node | null)) away();
    };
    const doc = host.ownerDocument as Document | null | undefined;
    if (doc) scope.registerDomEvent(doc, "mousedown", outside, { capture: true });
    else scope.registerDomEvent(host, "mousedown", outside, { capture: true });
    scope.registerDomEvent(el, "keydown", (event: KeyboardEvent) => {
        if (event.key !== "Escape" || busy()) return;
        event.preventDefault();
        event.stopPropagation();
        away();
    });
    return { el, scope, gone: false };
}

/**
 * Where it sits: by the box it was asked from — at `y` of that box — kept inside what it floats over,
 * and growing from that point. `prefix` names its custom properties (`--zf-<prefix>-x`).
 */
export function placeFloating(host: HTMLElement, floating: Floating, from: FloatBox, prefix: string, below = false): void {
    const box = host.getBoundingClientRect();
    const size = floating.el.getBoundingClientRect();
    const width = size.width || 0;
    const height = size.height || 0;
    const centre = from.left + from.width / 2 - box.left;
    const top = from.top + (below ? from.height : 0) - box.top;
    const x = Math.max(GAP_PX, Math.min(centre - width / 2, box.width - width - GAP_PX));
    const y = Math.max(GAP_PX, Math.min(top, box.height - height - GAP_PX));
    floating.el.setCssProps({
        [`--zf-${prefix}-x`]: `${Math.round(x)}px`,
        [`--zf-${prefix}-y`]: `${Math.round(y)}px`,
        "--zf-origin-x": `${Math.round(centre - x)}px`,
        "--zf-origin-y": `${Math.round(top - y)}px`,
    });
}

/** It grows from where it was asked. */
export function growFloating(floating: Floating): void {
    if (!motionWelcome(floating.el)) return;
    floating.el.animate(
        [
            { transform: "scale(0.96)", opacity: 0 },
            { transform: "scale(1)", opacity: 1 },
        ],
        { duration: MOTION.fast, easing: MOTION.ease }
    );
}

/** It shrinks back to where it came from, and goes. `leaving` is the class it wears meanwhile. */
export function closeFloating(floating: Floating, leaving: string, animated = true): void {
    if (floating.gone) return;
    floating.gone = true;
    floating.scope.unload();
    floating.el.addClass(c(leaving));
    if (!animated || !motionWelcome(floating.el)) {
        floating.el.remove();
        return;
    }
    const out = floating.el.animate(
        [
            { transform: "scale(1)", opacity: 1 },
            { transform: "scale(0.96)", opacity: 0 },
        ],
        { duration: MOTION.fast, easing: MOTION.ease, fill: "forwards" }
    );
    const drop = () => floating.el.remove();
    out.onfinish = drop;
    ((floating.el as HTMLElement & { win?: Window }).win ?? window).setTimeout(drop, MOTION.fast + 300);
}
