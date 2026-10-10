import { c } from "architecture";
import type { TextSpan } from "application/thinking/quoteAnchor";
import { motionWelcome } from "./readerMotion";
import { textNodes, unwrapMark, wrapSpan, type NodeLike } from "./readerMarks";

/**
 * **You are here** (#761 FR-17; #751 FR-13 relies on it). A place you travelled to is shown for a
 * moment by a quiet mark drawn *under* the text — never the legacy box-shadow flash: it fades in
 * (120 ms) once the travel has landed, is held about a second, and is gone over about 1.2 s. Opacity
 * only (`zf-reader-here` in reader.scss). Under reduced motion it simply shows for 1.5 s, then goes.
 *
 * The mark is a class: on a highlight's own marks it is added and taken off; anywhere else the first
 * words of the place are wrapped in a span for the moment, and unwrapped after, leaving the text
 * exactly as it was.
 */

/** The whole mark: 120 ms in, about a second held, about 1.2 s out (the keyframes' total). */
export const HERE_MS = 2400;
/** Under reduced motion: shown, then gone, without fading. */
export const HERE_REDUCED_MS = 1500;
/** How much of the place is marked: its first line, about. */
export const HERE_CHARS = 60;

type El = HTMLElement & { win?: Window };

function windowOf(el: HTMLElement): Window {
    return (el as El).win ?? window;
}

/** How long the mark stays, after `delay` ms of travel. */
export function hereLifetime(el: HTMLElement, delay: number): number {
    return motionWelcome(el) ? Math.max(0, delay) + HERE_MS : HERE_REDUCED_MS;
}

/** Mark elements that already hold the place (a highlight's marks): the class, for a moment. */
export function markHereOn(marks: readonly HTMLElement[], delay = 0): void {
    const first = marks[0];
    if (!first) return;
    const name = c("reader-here");
    for (const mark of marks) {
        mark.setCssProps?.({ "--zf-here-delay": `${Math.max(0, Math.round(delay))}ms` });
        mark.addClass(name);
    }
    windowOf(first).setTimeout(() => {
        for (const mark of marks) mark.removeClass(name);
    }, hereLifetime(first, delay));
}

/** A mark drawn at a place: its spans, and how long it waits for the move to land. */
export interface HereMark {
    marks: HTMLElement[];
    /** Wait `ms` for the move — known once the move has started — before showing. */
    after(ms: number): void;
}

/**
 * Mark the words of `body` that start at `offset` (its text, as `chapterText` reads it): the first
 * line of the place, about. Drawn first, so a caret made for the place afterwards is inside it; shown
 * once `after(ms)` says the move has landed, and unwrapped when it is over.
 */
export function markHereAt(body: HTMLElement, offset: number): HereMark {
    const root = body as unknown as NodeLike;
    const length = textNodes(root).reduce((sum, node) => sum + node.data.length, 0);
    if (length === 0) return { marks: [], after: () => undefined };
    const start = Math.max(0, Math.min(offset, length - 1));
    const span: TextSpan = { start, end: Math.min(length, start + HERE_CHARS) };
    const marks = wrapSpan(root, span, () => {
        const mark = body.createSpan();
        mark.remove();
        return mark;
    }) as unknown as HTMLElement[];
    const win = windowOf(body);
    let timer: number | undefined;
    const after = (ms: number) => {
        const delay = Math.max(0, Math.round(ms));
        for (const mark of marks) {
            mark.setCssProps({ "--zf-here-delay": `${delay}ms` });
            mark.addClass(c("reader-here"));
        }
        win.clearTimeout(timer);
        timer = win.setTimeout(() => {
            for (const mark of marks) unwrapMark(mark);
        }, hereLifetime(body, delay));
    };
    return { marks, after };
}
