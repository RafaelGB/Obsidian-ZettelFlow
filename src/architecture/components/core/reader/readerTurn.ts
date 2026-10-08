import { c } from "architecture";
import { MOTION, motionWelcome } from "./readerMotion";
import type { ChapterMotion } from "./readingMotion";

/**
 * **A chapter changes physically** (#735, epic #729; constitution §XVI): the page you were on is laid
 * on top as a sheet of paper, the next chapter is drawn underneath, and the sheet leaves the way the
 * reader chose — a leaf turning on the spine, the text carrying on in the reading direction, or a sheet
 * sliding off the stack. Never a dissolve. Transform and opacity only; any key or click ends it.
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
        target.getContext("2d")?.drawImage(canvas, 0, 0);
    });
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
    place(copy, rectOf(page), view, true);
    copyVisible(page, copy, view);
    clip.appendChild(copy);
    return sheet;
}

let running: { animations: Animation[]; cleanup: () => void } | null = null;

/** Ends a turn still playing — a second → arrives before the first sheet has gone. */
export function endChapterTurn(): void {
    const turn = running;
    running = null;
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
    const sheet = sheetOf(root, stage, page);
    sheet.addClass(c(`turn-sheet--${motion}`));
    const shade = root.createDiv({ cls: c("turn-shade"), attr: { "aria-hidden": "true" } });
    root.insertBefore(shade, sheet);
    const timing = { duration: motion === "flow" ? MOTION.turnFlow : MOTION.turn, fill: "forwards" as const };
    let animations: Animation[] = [];
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
    const stopSkip = (() => {
        const skip = () => endChapterTurn();
        win.addEventListener("keydown", skip, true);
        win.addEventListener("pointerdown", skip, true);
        return () => {
            win.removeEventListener("keydown", skip, true);
            win.removeEventListener("pointerdown", skip, true);
        };
    })();
    const turn = {
        animations,
        cleanup: () => {
            stopSkip();
            sheet.remove();
            shade.remove();
            for (const animation of animations) if (animation.effect && (animation.effect as KeyframeEffect).target === stage) animation.cancel();
        },
    };
    running = turn;
    void Promise.race([
        Promise.all(animations.map((animation) => animation.finished.catch(() => undefined))),
        new Promise((resolve) => win.setTimeout(resolve, MOTION.turn * 3)),
    ]).then(() => {
        if (running === turn) {
            running = null;
            turn.cleanup();
        }
    });
    return true;
}
