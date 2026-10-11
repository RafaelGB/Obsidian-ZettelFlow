import { c } from "architecture";
import { MOTION, motionWelcome } from "./readerMotion";

/**
 * **A list that moves instead of redrawing** (#754 FR-18–FR-20, FR-22) — a keyed reconcile with FLIP.
 *
 * Alongside's cards change as you read on and as you switch lenses, and a redraw would be a cut
 * (§XVI): the whole list blinking for an item or two. So each child carries a key, and between two
 * lists of keys:
 * - an item that **stays** keeps its element, and slides from where it was to where it is now — the
 *   transform that undoes the move, played back to nothing (First, Last, Invert, Play);
 * - an item that **leaves** fades and drops 4 px (or slides 16 px aside, for *Not related*), taken
 *   out of the flow at its old box, so the gap closes by the others' slide — never by its height;
 * - an item that **arrives** fades and rises 4 px, 20 ms after the one before it, six at most, all
 *   done within the base beat.
 *
 * Transform and opacity only, through the Web Animations API; under reduced motion, or where the API
 * is missing, the list simply is the next one. Shared by R3: #756, #759 and #762 reuse it.
 */

/** The attribute a child's key lives in. */
export const FLIP_KEY_ATTR = "data-zf-key";
/** How far apart arrivals start. */
export const FLIP_STAGGER_MS = 20;
/** How many arrivals are staggered; the rest start with the last of them. */
export const FLIP_MAX_STAGGER = 6;
/**
 * When cards leave as others arrive, the arrivals wait this long: the leavers are a third gone, so
 * a new card rises over a fading one rather than through it (walk finding).
 */
export const FLIP_LEAVE_LEAD_MS = 30;

export interface ReconcileOptions {
    /** How a leaving item goes: it drops (the default), or it is set aside sideways. */
    leave?: "drop" | "aside";
    /** How an arriving item comes: it rises (the default), or it comes back from aside. */
    arrive?: "rise" | "aside";
}

export interface Reconciled {
    /** Jump every move to its end: input during a move must never wait for it (FR-22). */
    finish(): void;
}

interface Box {
    left: number;
    top: number;
    width: number;
    height: number;
}

const running = new WeakMap<HTMLElement, { animations: Animation[]; leaving: Set<HTMLElement>; timers: number[] }>();

const LEAVING = () => c("reader-flip-leaving");

function boxOf(el: HTMLElement): Box {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function ownWindow(el: HTMLElement): Window {
    return (el as HTMLElement & { win?: Window }).win ?? window;
}

const offset = (aside: boolean, distance: number) => (aside ? `translate(${distance}px, 0px)` : `translate(0px, ${distance}px)`);

/** Finish what the last reconcile of `host` left playing, and take its leavers away. */
function settle(host: HTMLElement): void {
    const state = running.get(host);
    if (!state) return;
    running.delete(host);
    for (const animation of state.animations) {
        try {
            animation.finish();
        } catch {
            // An animation that cannot finish (cancelled already) is simply left.
        }
    }
    for (const el of state.leaving) el.remove();
    for (const timer of state.timers) ownWindow(host).clearTimeout(timer);
}

/**
 * Make `host`'s keyed children the items `keys` names, in that order. `create(key)` draws a missing
 * one (anywhere in `host`; it is put in its place here).
 */
export function reconcile(host: HTMLElement, keys: readonly string[], create: (key: string) => HTMLElement, options: ReconcileOptions = {}): Reconciled {
    settle(host);
    const motion = motionWelcome(host);
    const current = new Map<string, HTMLElement>();
    for (const child of Array.from(host.children) as HTMLElement[]) {
        const key = child.getAttribute(FLIP_KEY_ATTR);
        if (key !== null && !child.hasClass(LEAVING())) current.set(key, child);
    }
    const wanted = new Set(keys);
    const hostBox = motion ? boxOf(host) : null;
    // First: where everything is before the change.
    const before = new Map<HTMLElement, Box>();
    if (motion) for (const el of current.values()) before.set(el, boxOf(el));

    const animations: Animation[] = [];
    const timers: number[] = [];
    const leaving = new Set<HTMLElement>();
    for (const [key, el] of current) {
        if (wanted.has(key)) continue;
        if (!motion || !hostBox) {
            el.remove();
            continue;
        }
        // Out of the flow at its old box, so the gap closes by the others' slide.
        const box = before.get(el) ?? boxOf(el);
        el.addClass(LEAVING());
        el.setCssProps({
            "--zf-flip-top": `${Math.round(box.top - hostBox.top)}px`,
            "--zf-flip-left": `${Math.round(box.left - hostBox.left)}px`,
            "--zf-flip-width": `${Math.round(box.width)}px`,
        });
        el.setAttribute("aria-hidden", "true");
        // Out of reach of the keyboard too: nothing in a card on its way out can take the focus.
        el.setAttribute("inert", "");
        leaving.add(el);
    }

    // The change itself: the staying in their new order, the new drawn in place.
    const arrived: HTMLElement[] = [];
    for (const key of keys) {
        let el = current.get(key);
        if (!el) {
            el = create(key);
            el.setAttribute(FLIP_KEY_ATTR, key);
            arrived.push(el);
        }
        host.appendChild(el);
    }
    for (const el of leaving) host.appendChild(el);

    if (!motion) return { finish: () => undefined };

    const ease = MOTION.ease;
    const aside = options.leave === "aside";
    for (const el of leaving) {
        const animation = el.animate([{ opacity: 1, transform: offset(aside, 0) }, { opacity: 0, transform: offset(aside, aside ? 16 : 4) }], { duration: MOTION.fast, easing: ease, fill: "forwards" });
        const gone = () => {
            el.remove();
            leaving.delete(el);
        };
        animation.onfinish = gone;
        timers.push(ownWindow(host).setTimeout(gone, MOTION.fast + 200));
        animations.push(animation);
    }
    // Last, Invert, Play: each that stayed slides from where it was.
    for (const [el, was] of before) {
        if (leaving.has(el)) continue;
        const now = boxOf(el);
        const dx = Math.round(was.left - now.left);
        const dy = Math.round(was.top - now.top);
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        animations.push(el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0px, 0px)" }], { duration: MOTION.base, easing: ease }));
    }
    const back = options.arrive === "aside";
    const lead = leaving.size > 0 ? FLIP_LEAVE_LEAD_MS : 0;
    arrived.forEach((el, i) => {
        const delay = lead + Math.min(i, FLIP_MAX_STAGGER - 1) * FLIP_STAGGER_MS;
        animations.push(
            el.animate([{ opacity: 0, transform: offset(back, back ? 16 : 4) }, { opacity: 1, transform: offset(back, 0) }], { duration: MOTION.fast, delay, easing: ease, fill: "backwards" })
        );
    });
    running.set(host, { animations, leaving, timers });
    return { finish: () => settle(host) };
}

/** Finish whatever `host`'s list is playing (input during a move, FR-22). */
export function finishFlip(host: HTMLElement): void {
    settle(host);
}
