import { MOTION, motionWelcome } from "architecture/components/core/reader/readerMotion";

/**
 * **The room pan** (#798, epic #797): the camera moves along the room strip, so the room you chose
 * arrives from the side it lives on — never a swap (§XVI).
 *
 * The settled position is a custom property the stylesheet turns into a translation; the move is
 * one Web Animations `transform`, on the shared motion tokens, with the nav indicator sliding in the
 * same gesture. Only the rooms the camera passes are painted while it moves. Any key or click jumps
 * the pan to its end, and nothing waits on an animation for longer than its own length and a beat.
 * Under reduced motion it is a cut to the same place.
 */

/** The custom property the strip's `transform` is computed from: the index of the room in view. */
export const ROOM_PROP = "--zf-community-room";
/** The indicator's place under its tab, in pixels: where it starts, and how wide it is. */
export const INDICATOR_X = "--zf-community-ind-x";
export const INDICATOR_W = "--zf-community-ind-w";

/** A room not in the shot: hidden, so a pan from Learn to Installed paints only what it passes. */
export const AWAY = "is-away";

/** Where a tab is along the nav. */
export interface Span {
    x: number;
    w: number;
}

export interface PanShot {
    strip: HTMLElement;
    /** Every room, in strip order. */
    rooms: HTMLElement[];
    from: number;
    to: number;
    indicator?: { el: HTMLElement; from: Span | null; to: Span | null };
}

/** The window an element lives in — a pop-out window has its own. */
export function ownWindow(el: HTMLElement): Window {
    return (el as HTMLElement & { win?: Window }).win ?? window;
}

/**
 * Any key or press, anywhere in the window, calls `skip` — caught first, as the Reader's shots do.
 * Returns the disarm. Shared by every Community shot (S2, S5, S6).
 */
export function armSkip(win: Window, skip: () => void): () => void {
    const handler = () => skip();
    win.addEventListener("keydown", handler, true);
    win.addEventListener("pointerdown", handler, true);
    return () => {
        win.removeEventListener("keydown", handler, true);
        win.removeEventListener("pointerdown", handler, true);
    };
}

/** Every animation finished, or `ms` gone by — whichever is first. Never waits forever. */
export function settledWithin(win: Window, animations: Animation[], ms: number): Promise<void> {
    const finished = Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
    const patience = new Promise<void>((resolve) => win.setTimeout(resolve, ms));
    return Promise.race([finished.then(() => undefined), patience]);
}

function finishAll(animations: Animation[]): void {
    for (const animation of animations) {
        try {
            animation.finish();
        } catch {
            // An animation with no end to jump to is already gone.
        }
    }
}

const stripAt = (index: number) => `translateX(${-index * 100}%)`;

/** The settled picture: the strip at `to`, the indicator under its tab, every other room away. */
function place(shot: PanShot): void {
    shot.strip.setCssProps({ [ROOM_PROP]: String(shot.to) });
    shot.rooms.forEach((room, index) => room.toggleClass(AWAY, index !== shot.to));
    placeIndicator(shot.indicator?.el, shot.indicator?.to ?? null);
}

export function placeIndicator(el: HTMLElement | undefined, span: Span | null): void {
    if (!el) return;
    el.toggleClass(AWAY, !span || span.w <= 0);
    if (!span) return;
    el.setCssProps({ [INDICATOR_X]: `${Math.round(span.x)}px`, [INDICATOR_W]: `${Math.round(span.w)}px` });
}

/** One pan at a time: a new one first lands the one still moving. */
export class CommunityPan {
    private running: { animations: Animation[]; stopSkip: () => void } | null = null;

    /** Jump whatever is moving to its end. */
    finish(): void {
        if (this.running) finishAll(this.running.animations);
    }

    async run(shot: PanShot): Promise<void> {
        this.finish();
        place(shot);
        if (shot.from === shot.to || shot.from < 0 || !motionWelcome(shot.strip)) return;

        // The rooms between the two are in the shot; the rest stay away.
        const low = Math.min(shot.from, shot.to);
        const high = Math.max(shot.from, shot.to);
        shot.rooms.forEach((room, index) => room.toggleClass(AWAY, index < low || index > high));

        const timing = { duration: MOTION.turn, easing: MOTION.ease };
        const animations: Animation[] = [];
        const strip = shot.strip.animate([{ transform: stripAt(shot.from) }, { transform: stripAt(shot.to) }], timing);
        if (strip) animations.push(strip);
        const ind = shot.indicator;
        if (ind?.from && ind.to && ind.to.w > 0) {
            const scale = Math.round((ind.from.w / ind.to.w) * 1000) / 1000;
            const slide = ind.el.animate(
                [
                    { transform: `translateX(${Math.round(ind.from.x)}px) scaleX(${scale})` },
                    { transform: `translateX(${Math.round(ind.to.x)}px) scaleX(1)` },
                ],
                timing
            );
            if (slide) animations.push(slide);
        }

        const win = ownWindow(shot.strip);
        const stopSkip = armSkip(win, () => finishAll(animations));
        const running = { animations, stopSkip };
        this.running = running;
        try {
            await settledWithin(win, animations, MOTION.turn + 300);
        } finally {
            stopSkip();
            if (this.running === running) {
                this.running = null;
                shot.rooms.forEach((room, index) => room.toggleClass(AWAY, index !== shot.to));
            }
        }
    }
}
