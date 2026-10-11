import { c } from "architecture";
import { HIGHLIGHT_MEANINGS } from "application/thinking/highlightMeaning";
import { MOTION } from "./readerMotion";

/**
 * **The ink moves, never the text** (#758 FR-13): how a highlight's tint leaves the page or comes
 * back to it without a word moving or fading.
 *
 * A mark's tint is its own `background-color`, and a colour is not something the compositor moves.
 * So for the length of a move the ink is *lifted*: the mark lets go of its tint, and one rectangle
 * per line box takes its place **under** the words, in the same ink. Only the rectangles' opacity is
 * animated; at the end they go and the mark takes its tint back — the last frame and the resting
 * frame are the same picture, so the swap cannot be seen.
 *
 * This file and `readerLayers.ts` are the only places that put a mark away (FR-11): Recall (#760)
 * uses the same two, unchanged.
 */

/** The class a mark wears while it is put away: its ink gone, its words exactly where they were. */
export const AWAY = "reader-highlight--away";

/** Put a mark (or a row, or ink) away, or bring it back, at once. */
export function putAway(el: Element, away: boolean): void {
    (el as HTMLElement).toggleClass(c(AWAY), away);
}

/** Whether a mark is put away now. */
export function isAway(el: Element): boolean {
    return (el as HTMLElement).hasClass(c(AWAY));
}

/** One move of the ink: its animations, and what is left to tidy once it has played. Idempotent. */
export interface InkMove {
    animations: Animation[];
    end(): void;
}

type Box = { left: number; top: number; width: number; height: number };

/** The line boxes of `marks`, in the stage's own scrolled coordinates — read now, never cached. */
function lineBoxes(marks: readonly HTMLElement[], stage: HTMLElement): { box: Box; meaning: string | undefined }[] {
    const frame = stage.getBoundingClientRect();
    const out: { box: Box; meaning: string | undefined }[] = [];
    for (const mark of marks) {
        if (mark.isConnected === false) continue;
        const meaning = HIGHLIGHT_MEANINGS.find((m) => mark.hasClass(c(`reader-highlight--${m}`)));
        for (const rect of Array.from(mark.getClientRects?.() ?? [])) {
            if (!(rect.width > 0) || !(rect.height > 0)) continue;
            out.push({
                box: { left: rect.left - frame.left + (stage.scrollLeft || 0), top: rect.top - frame.top + (stage.scrollTop || 0), width: rect.width, height: rect.height },
                meaning,
            });
        }
    }
    return out;
}

/**
 * Lift the ink of one highlight's marks and fade it `in` (it comes back) or `out` (it is put away),
 * under words that never move. Returns the move, or `null` when there is nothing on screen to draw —
 * the caller then switches the marks at once.
 */
export function liftInk(marks: readonly HTMLElement[], stage: HTMLElement, way: "in" | "out", timing: { delay: number; duration: number }): InkMove | null {
    const boxes = lineBoxes(marks, stage);
    if (boxes.length === 0) return null;
    const layer = stage.createDiv({ cls: c("reader-ink-lifts"), attr: { "aria-hidden": "true" } });
    stage.prepend(layer);
    // The rectangles sit under the page's words: the stage holds them in its own stacking context
    // while any lift is on it, and gives it back after.
    stage.addClass(c("reader-stage--lifting"));
    // The mark lets go of its tint in the same frame the rectangles take it.
    if (way === "out") marks.forEach((mark) => putAway(mark, true));
    const animations: Animation[] = [];
    for (const { box, meaning } of boxes) {
        const rect = layer.createDiv({ cls: [c("reader-ink-lift"), ...(meaning ? [c(`reader-highlight--${meaning}`)] : [])] });
        rect.setCssProps({
            "--zf-lift-x": `${Math.round(box.left)}px`,
            "--zf-lift-y": `${Math.round(box.top)}px`,
            "--zf-lift-w": `${Math.round(box.width)}px`,
            "--zf-lift-h": `${Math.round(box.height)}px`,
        });
        const frames = way === "in" ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }];
        const animation = rect.animate(frames, { duration: timing.duration, delay: timing.delay, easing: MOTION.ease, fill: way === "in" ? "backwards" : "forwards" });
        if (animation) animations.push(animation);
    }
    const win = (stage as HTMLElement & { win?: Window }).win;
    let timer: number | undefined;
    let ended = false;
    const end = () => {
        if (ended) return;
        ended = true;
        if (timer !== undefined) win?.clearTimeout?.(timer);
        if (way === "in") marks.forEach((mark) => putAway(mark, false));
        layer.remove();
        if (!stage.querySelector(`.${c("reader-ink-lifts")}`)) stage.removeClass(c("reader-stage--lifting"));
    };
    if (animations.length === 0) {
        end();
        return null;
    }
    // The last of them ends the move; anything that happens to an animation, the move still ends.
    animations[animations.length - 1].onfinish = end;
    timer = win?.setTimeout?.(end, timing.delay + timing.duration + 200);
    return { animations, end };
}

/** The fade each element of its own is in, so the next one can take over from it. */
const fading = new WeakMap<Element, Animation>();

/** The opacity an element rests at, as its stylesheet says; 1 where it cannot be read. */
function restingOpacity(el: HTMLElement): number {
    const win = (el as HTMLElement & { win?: Window }).win;
    const value = Number.parseFloat(win?.getComputedStyle?.(el)?.opacity ?? "");
    return Number.isFinite(value) && value > 0 ? value : 1;
}

/**
 * Anything that is its own element — ink in the margin (#745), a page's highlight rectangles in Page
 * view, a row of the margin's list — fades by its own opacity. A row also slides in 8 px (FR-13).
 */
export function fadeOwn(el: HTMLElement, way: "in" | "out", timing: { delay: number; duration: number }, slide = false): InkMove | null {
    if (typeof (el as { animate?: unknown }).animate !== "function") {
        putAway(el, way === "out");
        return null;
    }
    // A fade still held on it — an earlier one's last frame — lets go first, or it would win.
    fading.get(el)?.cancel?.();
    fading.delete(el);
    if (way === "in") putAway(el, false);
    // To and from the opacity it rests at — a page's highlight is a wash, kept ink a little quiet —
    // so the last frame is the resting one.
    const rest = restingOpacity(el);
    const frames =
        way === "in"
            ? slide
                ? [{ opacity: 0, transform: "translateX(8px)" }, { opacity: rest, transform: "translateX(0px)" }]
                : [{ opacity: 0 }, { opacity: rest }]
            : [{ opacity: rest }, { opacity: 0 }];
    const animation = el.animate(frames, { duration: timing.duration, delay: timing.delay, easing: MOTION.ease, fill: way === "in" ? "backwards" : "forwards" });
    let ended = false;
    const end = () => {
        if (ended) return;
        ended = true;
        if (way === "out") {
            putAway(el, true);
            animation?.cancel?.();
        }
    };
    if (!animation) {
        end();
        return null;
    }
    fading.set(el, animation);
    animation.onfinish = end;
    return { animations: [animation], end };
}
