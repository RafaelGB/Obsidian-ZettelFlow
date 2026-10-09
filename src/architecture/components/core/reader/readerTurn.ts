import { c } from "architecture";
import { MOTION, motionWelcome } from "./readerMotion";
import type { ChapterMotion } from "./readingMotion";

/**
 * **A chapter changes physically** (#735, epic #729; constitution §XVI): the page you were on is laid
 * on top as a sheet of paper, the next chapter is drawn underneath, and the sheet leaves the way the
 * reader chose — a leaf turning on the spine, the text carrying on in the reading direction, or a sheet
 * sliding off the stack. Never a dissolve. Transform and opacity only; any key or click ends it.
 *
 * A finger can hold the same turn (#750): `beginChapterScrub` builds it paused and moves it with the
 * finger; the clock's turn and the finger's are one shape, built in one place (`buildTurn`).
 */

interface Box {
    left: number;
    top: number;
    width: number;
    height: number;
}

type El = HTMLElement & { win?: Window };

const px = (n: number) => `${Math.round(n * 100) / 100}px`;

function rectOf(el: Element): Box {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function place(el: HTMLElement, box: Box, origin: Box, withHeight: boolean): void {
    el.addClass(c("turn-block"));
    el.setCssProps({
        "--zf-turn-x": px(box.left - origin.left),
        "--zf-turn-y": px(box.top - origin.top),
        "--zf-turn-w": px(box.width),
        ...(withHeight ? { "--zf-turn-h": px(box.height) } : {}),
    });
}

/** A canvas is copied empty: draw what it shows (a PDF page laid out as printed). */
function copyCanvases(from: Element, to: Element): void {
    const sources = Array.from(from.querySelectorAll("canvas"));
    const targets = Array.from(to.querySelectorAll("canvas"));
    sources.forEach((canvas, i) => {
        const target = targets[i];
        if (!target) return;
        target.width = canvas.width;
        target.height = canvas.height;
        target.getContext?.("2d")?.drawImage(canvas, 0, 0);
    });
}

/** A copied picture is let go with its sheet: WebKit counts the memory of every canvas on the page. */
function releaseCanvases(el: Element): void {
    for (const canvas of Array.from(el.querySelectorAll("canvas"))) {
        canvas.width = 0;
        canvas.height = 0;
    }
}

/**
 * Only what is on screen, each piece where it is: a long chapter is not copied whole. A wrapper much
 * taller than the view is opened and its visible children placed inside a shallow copy of it (its
 * classes keep the type); anything else in view is copied whole, at its own place and width.
 */
function copyVisible(node: HTMLElement, into: HTMLElement, view: Box, depth = 0): void {
    const origin = rectOf(node);
    for (const child of Array.from(node.children) as HTMLElement[]) {
        const box = rectOf(child);
        if (box.height === 0 || box.top + box.height < view.top || box.top > view.top + view.height) continue;
        if (depth < 4 && box.height > view.height * 2 && child.children.length > 0) {
            const shell = child.cloneNode(false) as HTMLElement;
            place(shell, box, origin, true);
            into.appendChild(shell);
            copyVisible(child, shell, view, depth + 1);
            continue;
        }
        const copy = child.cloneNode(true) as HTMLElement;
        copyCanvases(child, copy);
        place(copy, box, origin, false);
        into.appendChild(copy);
    }
}

/** A sheet of paper over the stage, holding the page as it is on screen now. */
function sheetOf(root: HTMLElement, stage: HTMLElement, page: HTMLElement): HTMLElement {
    const view = rectOf(stage);
    const sheet = root.createDiv({ cls: c("turn-sheet"), attr: { "aria-hidden": "true" } });
    // Right after the stage: the title line, the dots and the bar stay above the paper.
    root.insertBefore(sheet, stage.nextSibling);
    const clip = sheet.createDiv({ cls: c("turn-clip") });
    const copy = page.cloneNode(false) as HTMLElement;
    copy.removeClass(c("reader-page--enter"));
    copy.removeClass(c("reader-page--under-scrub"));
    place(copy, rectOf(page), view, true);
    copyVisible(page, copy, view);
    clip.appendChild(copy);
    return sheet;
}

interface Built {
    sheet: HTMLElement;
    shade: HTMLElement;
    animations: Animation[];
    duration: number;
}

/**
 * The sheet, its shade and the turn's keyframes — the one place a turn is shaped, so a turn played by
 * the clock and one driven by a finger are the same picture moving the same way.
 */
function buildTurn(root: HTMLElement, stage: HTMLElement, page: HTMLElement, motion: ChapterMotion, dir: 1 | -1, view: Box): Built {
    const sheet = sheetOf(root, stage, page);
    sheet.addClass(c(`turn-sheet--${motion}`));
    const shade = root.createDiv({ cls: c("turn-shade"), attr: { "aria-hidden": "true" } });
    root.insertBefore(shade, sheet);
    const duration = motion === "flow" ? MOTION.turnFlow : MOTION.turn;
    const timing = { duration, fill: "forwards" as const };
    let animations: Animation[];
    if (motion === "leaf") {
        // A leaf turns on the spine: forward from the left edge, back from the right one.
        sheet.addClass(c(dir > 0 ? "turn-sheet--spine-left" : "turn-sheet--spine-right"));
        const up = `perspective(${px(view.width * 2)}) rotateY(${dir > 0 ? -96 : 96}deg)`;
        animations = [
            sheet.animate([{ transform: `perspective(${px(view.width * 2)}) rotateY(0deg)` }, { transform: up }], { ...timing, easing: "cubic-bezier(0.65, 0, 0.35, 1)" }),
            shade.animate([{ opacity: 1 }, { opacity: 0 }], { ...timing, easing: "ease-in" }),
        ];
    } else if (motion === "flow") {
        // The text carries on the way you were reading: this chapter goes on up, the next rises behind it.
        const gap = view.height + view.height * 0.08;
        const seam = sheet.createDiv({ cls: [c("turn-seam"), c(dir > 0 ? "turn-seam--below" : "turn-seam--above")] });
        seam.createSpan({ cls: c("turn-seam-mark"), text: "❦" });
        shade.addClass(c("turn-shade--none"));
        const easing = "cubic-bezier(0.5, 0, 0.2, 1)";
        animations = [
            sheet.animate([{ transform: "translateY(0px)" }, { transform: `translateY(${px(-dir * gap)})` }], { ...timing, easing }),
            stage.animate([{ transform: `translateY(${px(dir * gap)})` }, { transform: "translateY(0px)" }], { ...timing, easing }),
        ];
    } else {
        // A sheet slides off the stack (forward) or the other way (back); the next page lifts from under it.
        const away = `translateX(${px(-dir * view.width * 1.08)}) rotate(${-dir * 3}deg)`;
        animations = [
            sheet.animate([{ transform: "translateX(0px) rotate(0deg)" }, { transform: away }], { ...timing, easing: "cubic-bezier(0.55, 0, 0.75, 0.6)" }),
            stage.animate([{ transform: "scale(0.97)" }, { transform: "scale(1)" }], { ...timing, easing: MOTION.ease }),
            shade.animate([{ opacity: 1 }, { opacity: 0 }], timing),
        ];
    }
    return { sheet, shade, animations, duration };
}

/** Any key or click ends a turn that plays: motion never stands between you and the page. */
function armSkip(win: Window): () => void {
    const skip = () => endChapterTurn();
    win.addEventListener("keydown", skip, true);
    win.addEventListener("pointerdown", skip, true);
    return () => {
        win.removeEventListener("keydown", skip, true);
        win.removeEventListener("pointerdown", skip, true);
    };
}

interface Turn {
    animations: Animation[];
    cleanup: () => void;
    /** A finger's turn: the live page comes back from under the sheet, for the next chapter. */
    reveal?: () => void;
}

let running: Turn | null = null;
/** A turn a finger let go past its third: the chapter shown next takes it as its own (#750). */
let adoptable: Turn | null = null;

/** Ends a turn still playing — a second → arrives before the first sheet has gone. */
export function endChapterTurn(): void {
    const turn = running;
    running = null;
    adoptable = null;
    if (!turn) return;
    for (const animation of turn.animations) {
        try {
            animation.finish();
        } catch {
            // Already gone.
        }
    }
    turn.cleanup();
}

/** Clean `turn` up once its animations have played — or a moment after they should have. */
function whenPlayed(turn: Turn, win: Window): void {
    void Promise.race([
        Promise.all(turn.animations.map((animation) => animation.finished.catch(() => undefined))),
        new Promise((resolve) => win.setTimeout(resolve, MOTION.turn * 3)),
    ]).then(() => {
        if (running !== turn) return;
        running = null;
        if (adoptable === turn) adoptable = null;
        turn.cleanup();
    });
}

/**
 * Lay the page you were on over the stage and play it out, `dir` the way you went (1 forward, -1
 * back). Call it before the page is emptied for the next chapter. Returns whether it plays; with
 * reduced motion, or nothing to show, the next chapter simply is there.
 */
export function playChapterTurn(root: HTMLElement, stage: HTMLElement, page: HTMLElement, motion: ChapterMotion, dir: 1 | -1): boolean {
    endChapterTurn();
    if (!motionWelcome(root) || !page.firstElementChild) return false;
    const view = rectOf(stage);
    if (!(view.width > 0) || !(view.height > 0)) return false;
    const win = (root as El).win ?? window;
    const { sheet, shade, animations } = buildTurn(root, stage, page, motion, dir, view);
    const stopSkip = armSkip(win);
    const turn: Turn = {
        animations,
        cleanup: () => {
            stopSkip();
            releaseCanvases(sheet);
            sheet.remove();
            shade.remove();
            for (const animation of animations) if (animation.effect && (animation.effect as KeyframeEffect).target === stage) animation.cancel();
        },
    };
    running = turn;
    whenPlayed(turn, win);
    return true;
}

/** A turn held under a finger (#750 D4): moved by `scrub`, then completed or sprung back on release. */
export interface ChapterScrub {
    /** How long the turn takes when the clock plays it. */
    readonly duration: number;
    /** Where the finger has the turn: 0 (not begun) to 1 (turned). */
    scrub(progress: number): void;
    /**
     * Let go. `complete` plays the rest at `rate` (the release speed; at once under reduced motion)
     * and waits for the next chapter to adopt it (`adoptChapterScrub`); `spring` plays it back to its
     * start in the shared beat and gives the page back exactly as it was.
     */
    release(outcome: "complete" | "spring", rate?: number): void;
    /** Drop it now, leaving nothing on screen. */
    cancel(): void;
}

/**
 * **Turning by finger** (#750 D4, FR-17, FR-22): the chapter's own turn — the same sheet, the same
 * keyframes — built paused and moved by the finger instead of a clock, on the compositor. The live
 * page is hidden under the sheet (opacity) and an underlay shows the paper and `label`, the chapter the
 * turn leads to: nothing is drawn or laid out until the finger lets go. Under reduced motion the sheet
 * still follows the finger — direct manipulation is not animation — and the release lands at once.
 *
 * Returns `null` where the turn cannot be built (no Web Animations, nothing on the page, no size).
 */
export function beginChapterScrub(root: HTMLElement, stage: HTMLElement, page: HTMLElement, motion: ChapterMotion, dir: 1 | -1, label: string): ChapterScrub | null {
    endChapterTurn();
    if (typeof (root as { animate?: unknown }).animate !== "function" || !page.firstElementChild) return null;
    const view = rectOf(stage);
    if (!(view.width > 0) || !(view.height > 0)) return null;
    const win = (root as El).win ?? window;
    const welcome = motionWelcome(root);
    const { sheet, shade, animations, duration } = buildTurn(root, stage, page, motion, dir, view);
    for (const animation of animations) {
        animation.pause();
        animation.currentTime = 0;
    }
    // Under the lifted sheet: the paper, and the name of where the turn goes.
    const underlay = root.createDiv({ cls: c("turn-underlay"), attr: { "aria-hidden": "true" } });
    underlay.createSpan({ cls: c("turn-underlay-label"), text: label });
    root.insertBefore(underlay, shade);
    page.addClass(c("reader-page--under-scrub"));
    let stopSkip: () => void = () => undefined;
    const reveal = () => {
        page.removeClass(c("reader-page--under-scrub"));
        underlay.remove();
    };
    const turn: Turn = {
        animations,
        reveal,
        cleanup: () => {
            stopSkip();
            reveal();
            releaseCanvases(sheet);
            sheet.remove();
            shade.remove();
            for (const animation of animations) {
                try {
                    animation.cancel();
                } catch {
                    // Already gone.
                }
            }
        },
    };
    running = turn;
    let released = false;
    return {
        duration,
        scrub: (progress) => {
            if (released || running !== turn) return;
            const at = Math.min(1, Math.max(0, progress)) * duration;
            for (const animation of animations) animation.currentTime = at;
        },
        release: (outcome, rate = 1) => {
            if (released || running !== turn) return;
            released = true;
            if (outcome === "complete") {
                adoptable = turn;
                stopSkip = armSkip(win);
                for (const animation of animations) {
                    if (welcome) {
                        animation.playbackRate = rate;
                        animation.play();
                    } else {
                        animation.finish();
                    }
                }
                whenPlayed(turn, win);
                return;
            }
            // Back where it started, in the shared beat; at once where motion is not welcome.
            if (!welcome) {
                endChapterTurn();
                return;
            }
            for (const animation of animations) {
                const at = Number(animation.currentTime ?? 0);
                if (at > 0) {
                    animation.playbackRate = -(at / MOTION.base);
                    animation.play();
                } else {
                    animation.finish();
                }
            }
            whenPlayed(turn, win);
        },
        cancel: () => {
            if (running === turn) endChapterTurn();
            else turn.cleanup();
        },
    };
}

/**
 * The chapter shown after a finger let a turn go takes the turn already playing as its own (#750 D4):
 * the live page comes back from under the sheet, to be emptied and drawn with the next chapter. True
 * once per release; any other chapter change plays a turn of its own.
 */
export function adoptChapterScrub(): boolean {
    const turn = adoptable;
    adoptable = null;
    if (!turn || running !== turn) return false;
    // Under the sheet, the next chapter is drawn on the live page now — no longer the paper.
    turn.reveal?.();
    return true;
}
