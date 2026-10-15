import { c } from "architecture";
import { MOTION, fly, motionWelcome } from "architecture/components/core/reader/readerMotion";
import { type Box, play } from "./systemShots";

/**
 * **The Learn room's shots** (#802 AC-10; §XVI one continuous shot).
 *
 * The pressed card's picture grows into the lesson's stage and becomes it; the camera travels down a
 * film strip of the step pictures; *Up next* slides the next lesson in like turning a chapter; Back
 * flies the picture home onto its card. One moving element per shot, transform and opacity only, the
 * Reader's `fly()` and motion tokens. Any key or press jumps a shot to its end, a timeout settles it
 * whatever the animation does, and under reduced motion each one is a cut to the same place.
 */

/** Durations, in milliseconds. */
export const LEARN_SHOT = {
    /** The card's picture onto the stage. */
    open: 560,
    /** The stage's picture home onto its card. */
    close: 480,
    /** The camera down the film, one picture on. */
    step: 600,
    /** The next lesson, slid in like a chapter. */
    turn: MOTION.turn,
    /** How long a flight waits for its picture before it gives up and cuts. */
    picture: 400,
} as const;

/** The custom property the film's settled position is computed from: the frame in view. */
export const FRAME_PROP = "--zf-learn-frame";

/**
 * A ghost of the picture, flown from one box onto another; `landed` shows the real thing in the frame
 * the ghost goes, exactly once — at the latest when the shot's patience runs out. With no motion, no
 * picture or no box, it is a cut: `landed` at once.
 */
export async function flyPicture(host: HTMLElement, src: string | null, from: Box | null, to: Box | null, duration: number, landed: () => void = () => undefined): Promise<void> {
    let done = false;
    const land = () => {
        if (done) return;
        done = true;
        landed();
    };
    if (!src || !from || !to || from.width <= 0 || to.width <= 0 || !motionWelcome(host)) {
        land();
        return;
    }
    const ghost = host.createDiv({ cls: c("learn-ghost"), attr: { "aria-hidden": "true" } });
    ghost.createEl("img", { cls: c("learn-ghost-img"), attr: { src, alt: "" } });
    const grown = to.width * to.height >= from.width * from.height;
    const flight = fly(host, ghost, from, to, { duration, grown, land: "become", onLanded: land });
    await play(host, [flight], duration);
    land();
}

/**
 * The camera, one picture on (or back): the film's settled place is a custom property, the move a
 * single `transform` from where it was. Returns the move, so the next step can land it first.
 */
export function filmStep(track: HTMLElement, from: number, to: number): { animation: Animation | null; settled: Promise<void> } {
    track.setCssProps({ [FRAME_PROP]: String(to) });
    if (from === to || !motionWelcome(track)) return { animation: null, settled: Promise.resolve() };
    const animation = track.animate([{ transform: `translateY(${-from * 100}%)` }, { transform: `translateY(${-to * 100}%)` }], {
        duration: LEARN_SHOT.step,
        easing: MOTION.ease,
    });
    return { animation, settled: play(track, [animation], LEARN_SHOT.step) };
}

/**
 * *Up next*: the lesson you were on slides out to the left and fades, the next arrives from the right
 * — the Reader's chapter turn, by hand, because `playChapterTurn` is the Reader's page DOM. The
 * outgoing sheet is lifted out of the flow for the turn, and gone at its end.
 */
export async function chapterTurn(outgoing: HTMLElement, incoming: HTMLElement): Promise<void> {
    outgoing.addClass("is-leaving");
    if (!motionWelcome(incoming)) {
        outgoing.remove();
        return;
    }
    const timing = { duration: LEARN_SHOT.turn, easing: MOTION.ease };
    const out = outgoing.animate([{ transform: "translateX(0)", opacity: 1 }, { transform: "translateX(-100%)", opacity: 0 }], { ...timing, fill: "forwards" });
    const into = incoming.animate([{ transform: "translateX(100%)" }, { transform: "translateX(0)" }], timing);
    try {
        await play(incoming, [out, into], LEARN_SHOT.turn);
    } finally {
        outgoing.remove();
    }
}
