import { MOTION, motionWelcome } from "architecture/components/core/reader/readerMotion";

/**
 * **The camera along a strip** (#798 → #875): a row of panes side by side, and the camera moves along
 * it, so the place you chose arrives from the side it lives on — never a swap (§XVI). Born as the
 * Community's room pan; Home's three modes are the second set it films, so there is one pan, not two.
 *
 * The settled position is a custom property the stylesheet turns into a translation; the move is one
 * Web Animations `transform`, on the shared motion tokens, with the indicator under the tabs sliding in
 * the same gesture — and whatever else rides it (a card flying into its place, #875) on the same curve.
 * Only the panes the camera passes are painted while it moves. Any key or press jumps the pan to its
 * end. Under reduced motion it is a cut to the same place.
 */

/** A pane not in the shot: hidden, so a pan across three panes paints only what it passes. */
export const AWAY = "is-away";

/** Where a tab is along its bar. */
export interface Span {
    x: number;
    w: number;
}

export interface PanShot {
    strip: HTMLElement;
    /** Every pane, in strip order. */
    rooms: HTMLElement[];
    from: number;
    to: number;
    indicator?: { el: HTMLElement; from: Span | null; to: Span | null };
}

/** The three custom properties a set is placed by: the pane in view, and the indicator's place. */
export interface PanProps {
    at: string;
    indX: string;
    indW: string;
}

/** The window an element lives in — a pop-out window has its own. */
export function ownWindow(el: HTMLElement): Window {
    return (el as HTMLElement & { win?: Window }).win ?? window;
}

/**
 * Any key or press, anywhere in the window, calls `skip` — caught first, as the Reader's shots do.
 * With `swallow` the input that jumps a shot does nothing else (#875 FR-15): the key or the press is
 * stopped, and the click a press would become is eaten once. Returns the disarm.
 */
export function armSkip(win: Window, skip: () => void, options: { swallow?: boolean } = {}): () => void {
    let eatClick = false;
    const handler = (event: Event) => {
        skip();
        if (!options.swallow) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.type === "pointerdown") eatClick = true;
    };
    const click = (event: Event) => {
        if (!eatClick) return;
        eatClick = false;
        event.preventDefault();
        event.stopImmediatePropagation();
    };
    win.addEventListener("keydown", handler, true);
    win.addEventListener("pointerdown", handler, true);
    if (options.swallow) win.addEventListener("click", click, true);
    return () => {
        win.removeEventListener("keydown", handler, true);
        win.removeEventListener("pointerdown", handler, true);
        // The click a skipping press becomes lands after the shot: it is still eaten, then let go.
        if (options.swallow) win.setTimeout(() => win.removeEventListener("click", click, true), 0);
    };
}

/** Every animation finished, or `ms` gone by — whichever is first. Never waits forever. */
export function settledWithin(win: Window, animations: Animation[], ms: number): Promise<void> {
    const finished = Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
    const patience = new Promise<void>((resolve) => win.setTimeout(resolve, ms));
    return Promise.race([finished.then(() => undefined), patience]);
}

export function finishAll(animations: Animation[]): void {
    for (const animation of animations) {
        try {
            animation.finish();
        } catch {
            // An animation with no end to jump to is already gone.
        }
    }
}

const stripAt = (index: number) => `translateX(${-index * 100}%)`;

/** One pan at a time: a new one first lands the one still moving. */
export class CameraPan {
    private running: { animations: Animation[]; stopSkip: () => void } | null = null;

    constructor(private readonly props: PanProps) {}

    /** Jump whatever is moving to its end. */
    finish(): void {
        if (this.running) finishAll(this.running.animations);
    }

    /** The settled picture: the strip at `to`, the indicator under its tab, every other pane away. */
    place(shot: PanShot): void {
        shot.strip.setCssProps({ [this.props.at]: String(shot.to) });
        shot.rooms.forEach((room, index) => room.toggleClass(AWAY, index !== shot.to));
        this.placeIndicator(shot.indicator?.el, shot.indicator?.to ?? null);
    }

    placeIndicator(el: HTMLElement | undefined, span: Span | null): void {
        if (!el) return;
        el.toggleClass(AWAY, !span || span.w <= 0);
        if (!span) return;
        el.setCssProps({ [this.props.indX]: `${Math.round(span.x)}px`, [this.props.indW]: `${Math.round(span.w)}px` });
    }

    /**
     * Pan from `shot.from` to `shot.to`. `ride` is called once the strip is placed at its end, before
     * anything moves, and returns what else is in the shot — a flight measured where it will land —
     * so it starts in the same frame, on the same beat, and jumps to its end with the pan.
     */
    async run(shot: PanShot, options: { ride?: () => (Animation | null)[]; swallow?: boolean } = {}): Promise<void> {
        this.finish();
        this.place(shot);
        if (shot.from === shot.to || shot.from < 0 || !motionWelcome(shot.strip)) {
            options.ride?.().forEach((animation) => animation?.finish());
            return;
        }

        // The panes between the two are in the shot; the rest stay away.
        const low = Math.min(shot.from, shot.to);
        const high = Math.max(shot.from, shot.to);
        shot.rooms.forEach((room, index) => room.toggleClass(AWAY, index < low || index > high));

        const timing = { duration: MOTION.turn, easing: MOTION.ease };
        const animations: Animation[] = [];
        const riders = options.ride?.() ?? [];
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
        for (const rider of riders) if (rider) animations.push(rider);

        const win = ownWindow(shot.strip);
        const stopSkip = armSkip(win, () => finishAll(animations), { swallow: options.swallow === true });
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
