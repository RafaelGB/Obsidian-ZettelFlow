import { c } from "architecture";
import { MOTION, copyLive, motionWelcome } from "./readerMotion";

/**
 * **One continuous shot** (#734, epic #729; constitution §XVI): opening a book from the Library is a
 * camera move, never a cut. The shelf zooms with the book, the cover opens on the page you were on,
 * and that page lands exactly on the Reader's column — the real Reader, with everything it has, is
 * revealed underneath. Closing plays it backwards, onto the book in its slot.
 *
 * The camera films a *rig*: a layer over the window holding a copy of the shelf and of the page.
 * Everything moves by transform (and the odd opacity, never on a 3D parent), any key or click jumps a
 * shot to its end, and under reduced motion nothing here runs at all.
 */

export interface Box {
    left: number;
    top: number;
    width: number;
    height: number;
}

/** A camera: one scale and a translation, about the window's top-left. */
export interface Cam {
    s: number;
    x: number;
    y: number;
}

export const STILL: Cam = { s: 1, x: 0, y: 0 };

/** `after` filmed through `before`: the camera that does both. */
export function compose(after: Cam, before: Cam): Cam {
    return { s: after.s * before.s, x: after.s * before.x + after.x, y: after.s * before.y + after.y };
}

/** Where a box ends up on screen through a camera. */
export function onto(cam: Cam, box: Box): Box {
    return { left: box.left * cam.s + cam.x, top: box.top * cam.s + cam.y, width: box.width * cam.s, height: box.height * cam.s };
}

/** Push in: the book grows until it is most of the frame's height, centred in it. */
export function pushIn(book: Box, frame: Box, fill = 0.78): Cam {
    const s = book.height > 0 ? (frame.height * fill) / book.height : 1;
    const x = frame.left + frame.width / 2 - (book.left + book.width / 2) * s;
    const y = frame.top + (frame.height - book.height * s) / 2 - book.top * s;
    return { s, x, y };
}

/** Land: the page on screen becomes the reading column — its width, its left edge, the column's top. */
export function landOn(page: Box, column: Box): Cam {
    const s = page.width > 0 ? column.width / page.width : 1;
    return { s, x: column.left - page.left * s, y: column.top - page.top * s };
}

/** The camera as a transform. */
export function camCss(cam: Cam): string {
    const r = (n: number) => Math.round(n * 1000) / 1000;
    return `translate(${r(cam.x)}px, ${r(cam.y)}px) scale(${r(cam.s)})`;
}

/**
 * The same camera for an element whose own top-left sits at `origin` on screen (its transform turns
 * about that corner, not the window's).
 */
export function localCam(cam: Cam, origin: { left: number; top: number }): Cam {
    return { s: cam.s, x: (cam.s - 1) * origin.left + cam.x, y: (cam.s - 1) * origin.top + cam.y };
}

// ── the rig ───────────────────────────────────────────────────────────────────

/** A dolly: gathers speed, then glides to rest. A hinge: starts and stops with weight. */
const DOLLY = "cubic-bezier(0.45, 0, 0.15, 1)";
const HINGE = "cubic-bezier(0.65, 0, 0.35, 1)";

type El = HTMLElement & { win?: Window; doc?: Document };

function rectOf(el: Element): Box {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
}

const px = (n: number) => `${Math.round(n * 100) / 100}px`;

function boxVars(el: HTMLElement, box: Box): void {
    el.setCssProps({ "--zf-shot-x": px(box.left), "--zf-shot-y": px(box.top), "--zf-shot-w": px(box.width), "--zf-shot-h": px(box.height) });
}

interface Rig {
    root: HTMLElement;
    camera: HTMLElement;
    book: HTMLElement;
    page: HTMLElement;
    inner: HTMLElement;
    edge: HTMLElement;
    lid: HTMLElement;
    wash: HTMLElement;
}

/** The book the camera films: a page under a cover that opens on its left edge. */
function buildRig(doc: Document, cover: HTMLElement | null, book: Box): Rig {
    const root = doc.body.createDiv({ cls: c("shot"), attr: { "aria-hidden": "true" } });
    const camera = root.createDiv({ cls: c("shot-camera") });
    const bookEl = camera.createDiv({ cls: c("shot-book") });
    boxVars(bookEl, book);
    // The depth of the scene, from the book's own size: a perspective that reads the same at any size.
    bookEl.setCssProps({ "--zf-shot-depth": px(book.height * 4) });
    const page = bookEl.createDiv({ cls: c("shot-page") });
    const inner = page.createDiv({ cls: c("shot-inner") });
    const edge = page.createDiv({ cls: c("shot-edge") });
    const lid = bookEl.createDiv({ cls: c("shot-lid") });
    const front = cover ? (cover.cloneNode(true) as HTMLElement) : lid.createDiv();
    front.addClass(c("shot-front"));
    lid.appendChild(front);
    const back = lid.createDiv({ cls: c("shot-back") });
    const wash = back.createDiv({ cls: c("shot-wash") });
    return { root, camera, book: bookEl, page, inner, edge, lid, wash };
}

/**
 * A copy of the Reader's page as it is on screen: the reader's own classes (its theme), the page, its
 * pictures. Resolves once the copied pictures are decoded (or a moment has passed): a copied picture
 * is painted only after it decodes, and a book that opens on its cover image showed a blank page.
 */
function copyPage(rig: Rig, readerRoot: HTMLElement, stage: HTMLElement, page: HTMLElement, bookWidth: number, win: Window): Promise<unknown> {
    const pageBox = rectOf(page);
    const stageBox = rectOf(stage);
    const frame = readerRoot.cloneNode(false) as HTMLElement;
    // Its theme and type, not its state: the Reader is out of sight while the shot plays, the copy is not.
    frame.removeClass(c("reader--in-shot"), c("reader--arrived"), c("reader--idle"), c("reader--leaving"));
    frame.addClass(c("shot-reader"));
    const copy = page.cloneNode(true) as HTMLElement;
    copy.removeClass(c("reader-page--enter"));
    // A canvas is copied empty, a designed page's shadow root not at all: both carried (#771).
    copyLive(page, copy);
    frame.appendChild(copy);
    rig.inner.appendChild(frame);
    rig.inner.setCssProps({
        "--zf-shot-pw": px(pageBox.width),
        "--zf-shot-k": String(bookWidth / Math.max(1, pageBox.width)),
        "--zf-shot-dy": px(pageBox.top - stageBox.top),
    });
    const paper = (readerRoot.win ?? window).getComputedStyle?.(readerRoot).backgroundColor;
    if (paper) rig.root.setCssProps({ "--zf-shot-paper": paper });
    const pictures = Array.from(copy.querySelectorAll("img")).map((img) => img.decode?.().catch(() => undefined));
    return Promise.race([Promise.all(pictures), wait(win, MOTION.base)]);
}

/** The column the page lands on: the page's left and width, the stage's top. */
function columnOf(stage: HTMLElement, page: HTMLElement): Box {
    const pageBox = rectOf(page);
    const stageBox = rectOf(stage);
    return { left: pageBox.left, top: stageBox.top, width: pageBox.width, height: stageBox.height };
}

interface Shot {
    rig: Rig;
    win: Window;
    book: Box;
    push: Cam;
    animations: Animation[];
    skipped: boolean;
    landing: boolean;
    pushed: Promise<unknown>;
    stopSkip: () => void;
}

let open: Shot | null = null;

/** Any key or click jumps the shot to its end: motion never stands between you and the page. */
function armSkip(win: Window, skip: () => void): () => void {
    const handler = () => skip();
    win.addEventListener("keydown", handler, true);
    win.addEventListener("pointerdown", handler, true);
    return () => {
        win.removeEventListener("keydown", handler, true);
        win.removeEventListener("pointerdown", handler, true);
    };
}

function finishAll(animations: Animation[]): void {
    for (const animation of animations) {
        try {
            animation.finish();
        } catch {
            // An animation with no end to jump to: it is already gone.
        }
    }
}

function settled(animations: Animation[]): Promise<unknown> {
    return Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
}

function createDivIn(parent: HTMLElement, name: string): HTMLElement {
    return parent.createDiv({ cls: c(name) });
}

function wait(win: Window, ms: number): Promise<void> {
    return new Promise((resolve) => win.setTimeout(resolve, ms));
}

/** A rig is let go with its copied pictures (#750): WebKit counts the memory of every canvas on the page. */
function removeRig(rig: Rig): void {
    for (const canvas of Array.from(rig.root.querySelectorAll("canvas"))) {
        canvas.width = 0;
        canvas.height = 0;
    }
    rig.root.remove();
}

function endOpen(shot: Shot): void {
    shot.stopSkip();
    removeRig(shot.rig);
    if (open === shot) open = null;
}

/**
 * **Push in** (stage one of the opening): the moment a book is clicked, the camera moves into it
 * while the Reader opens underneath. `view` is the Library's own view element, filmed as it is.
 * Returns whether the shot began; the Reader lands it (`landOpenShot`).
 */
export function beginOpenShot(view: HTMLElement, cover: HTMLElement): boolean {
    if (open) endOpen(open);
    if (!motionWelcome(cover)) return false;
    const book = rectOf(cover);
    const frame = rectOf(view);
    if (!(book.width > 0) || !(frame.width > 0)) return false;
    const el = cover as El;
    const doc = el.doc ?? document;
    const win = el.win ?? window;
    const rig = buildRig(doc, cover, book);
    // The shelf as it is now, filmed by the same camera: the Library's own view, copied.
    const scene = rig.camera.createDiv({ cls: c("shot-scene") });
    rig.camera.insertBefore(scene, rig.book);
    boxVars(scene, frame);
    const copy = view.cloneNode(true) as HTMLElement;
    copy.addClass(c("shot-fill"));
    scene.appendChild(copy);
    // A copy starts at the top: scroll it to where the shelf was.
    const scrolled = Array.from(view.querySelectorAll<HTMLElement>(".view-content"));
    const copies = Array.from(copy.querySelectorAll<HTMLElement>(".view-content"));
    scrolled.forEach((source, i) => {
        if (copies[i]) copies[i].scrollTop = source.scrollTop;
    });
    const push = pushIn(book, frame);
    const animation = rig.camera.animate([{ transform: camCss(STILL) }, { transform: camCss(push) }], {
        duration: MOTION.shotPush,
        easing: MOTION.ease,
        fill: "forwards",
    });
    const shot: Shot = {
        rig,
        win,
        book,
        push,
        animations: [animation],
        skipped: false,
        landing: false,
        pushed: animation.finished.catch(() => undefined),
        stopSkip: () => undefined,
    };
    shot.stopSkip = armSkip(win, () => {
        shot.skipped = true;
        finishAll(shot.animations);
    });
    open = shot;
    // A Reader that never lands (it failed to open): the shelf's copy does not stay on screen. And
    // whatever happens to a shot, its rig is gone a moment after it should have ended.
    win.setTimeout(() => {
        if (open === shot && !shot.landing) endOpen(shot);
    }, MOTION.shotPatience);
    win.setTimeout(() => {
        if (open === shot) endOpen(shot);
    }, MOTION.shotPatience + MOTION.shotLand + MOTION.base);
    return true;
}

/** Whether a Reader opening now is the end of a shot — it stays out of sight until the page lands. */
export function shotIncoming(): boolean {
    return open !== null && !open.landing;
}

/**
 * **Open and land** (stage two): the Reader's chapter is drawn and scrolled to your place. The page
 * under the cover is that page; the cover opens on its hinge, the camera lands the page on the column,
 * and the Reader underneath — out of sight until now — is the same picture, so nothing changes but
 * the copy going away. Its title line and bar arrive last. Always shows the Reader in the end.
 */
export async function landOpenShot(readerRoot: HTMLElement, stage: HTMLElement, page: HTMLElement): Promise<void> {
    const reveal = (arrived: boolean) => {
        readerRoot.removeClass(c("reader--in-shot"));
        if (arrived) readerRoot.addClass(c("reader--arrived"));
    };
    const shot = open;
    if (!shot || shot.landing) return reveal(false);
    shot.landing = true;
    // Never wait on the push for ever (a paused or dropped animation): past its time, land anyway.
    await Promise.race([shot.pushed, wait(shot.win, MOTION.shotPush + MOTION.base)]);
    if (open !== shot) return reveal(false);
    // A push still running (a slow frame): it ends where the landing starts, so the camera never jumps.
    finishAll(shot.animations);
    const { rig, book, push } = shot;
    await copyPage(rig, readerRoot, stage, page, book.width, shot.win);
    if (open !== shot) return reveal(false);
    const land = compose(landOn(onto(push, book), columnOf(stage, page)), push);
    const timing = { duration: MOTION.shotLand, fill: "forwards" as const };
    const scene = rig.camera.querySelector<HTMLElement>(`.${c("shot-scene")}`);
    const animations = [
        rig.camera.animate([{ transform: camCss(push) }, { transform: camCss(land) }], { ...timing, easing: DOLLY }),
        rig.lid.animate(
            [{ transform: "rotateY(0deg)" }, { transform: "rotateY(-178deg)", offset: 0.62 }, { transform: "rotateY(-178deg)" }],
            { ...timing, easing: HINGE }
        ),
        // The inside of the cover becomes the reader's empty margin: nothing has to vanish.
        rig.wash.animate([{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1, offset: 0.85 }, { opacity: 1 }], timing),
        rig.edge.animate([{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], timing),
        ...(scene ? [scene.animate([{ opacity: 1 }, { opacity: 1, offset: 0.3 }, { opacity: 0, offset: 0.85 }, { opacity: 0 }], timing)] : []),
    ];
    shot.animations = animations;
    if (shot.skipped) finishAll(animations);
    await Promise.race([settled(animations), wait(shot.win, MOTION.shotPatience)]);
    endOpen(shot);
    reveal(true);
}

/**
 * **Close**: the same shot backwards. The page you are on is frozen where it is, the leaf becomes the
 * Library (`leave`), and once your book is on the shelf again the camera pulls out from the page to
 * it: the cover closes, the shelf comes back around it. A book the shelf no longer shows (filtered
 * out, gone) just lets the page go. Returns whether it plays; the caller leaves either way.
 */
export function beginCloseShot(readerRoot: HTMLElement, stage: HTMLElement, page: HTMLElement, bookId: string, leave: () => void): boolean {
    if (!bookId || !motionWelcome(readerRoot)) return false;
    const el = readerRoot as El;
    const doc = el.doc ?? document;
    const win = el.win ?? window;
    const column = columnOf(stage, page);
    if (!(column.width > 0)) return false;
    if (open) endOpen(open);
    // The book is not known yet: a rig whose page sits exactly on the column, so nothing moves.
    const rig = buildRig(doc, null, column);
    // Until the camera moves, the Library being drawn underneath stays behind the Reader's own paper.
    const backdrop = createDivIn(rig.root, "shot-backdrop");
    rig.root.insertBefore(backdrop, rig.camera);
    boxVars(backdrop, rectOf(readerRoot));
    rig.lid.addClass(c("shot-lid--waiting"));
    rig.edge.addClass(c("shot-edge--waiting"));
    void copyPage(rig, readerRoot, stage, page, column.width, win);
    rig.inner.setCssProps({ "--zf-shot-dy": px(rectOf(page).top - rectOf(stage).top) });
    let animations: Animation[] = [];
    let skipped = false;
    const stopSkip = armSkip(win, () => {
        skipped = true;
        finishAll(animations);
    });
    const done = () => {
        stopSkip();
        removeRig(rig);
    };
    leave();
    void (async () => {
        const cover = await coverOnShelf(doc, win, bookId);
        if (!cover || skipped) {
            const fade = rig.root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: MOTION.base, easing: MOTION.ease, fill: "forwards" });
            animations = [fade];
            if (skipped) fade.finish();
            await settled(animations);
            return done();
        }
        const view = cover.closest<HTMLElement>(".workspace-leaf-content") ?? cover;
        const book = rectOf(cover);
        const frame = rectOf(view);
        const push = pushIn(book, frame);
        const land = compose(landOn(onto(push, book), column), push);
        // Rebuild the book at the shelf's size, filmed from where the page is: the same picture.
        boxVars(rig.book, book);
        rig.book.setCssProps({ "--zf-shot-depth": px(book.height * 4) });
        rig.inner.setCssProps({ "--zf-shot-k": String(book.width / Math.max(1, column.width)) });
        const front = cover.cloneNode(true) as HTMLElement;
        front.addClass(c("shot-front"));
        rig.lid.prepend(front);
        rig.lid.removeClass(c("shot-lid--waiting"));
        rig.edge.removeClass(c("shot-edge--waiting"));
        cover.addClass(c("shelf-cover--in-shot"));
        backdrop.remove();
        const timing = { duration: MOTION.shotClose, fill: "forwards" as const };
        const viewBox = { left: frame.left, top: frame.top };
        animations = [
            rig.camera.animate([{ transform: camCss(land) }, { transform: camCss(push), offset: 0.55 }, { transform: camCss(STILL) }], { ...timing, easing: DOLLY }),
            view.animate(
                [{ transform: camCss(localCam(land, viewBox)) }, { transform: camCss(localCam(push, viewBox)), offset: 0.55 }, { transform: camCss(STILL) }],
                { ...timing, easing: DOLLY }
            ),
            view.animate([{ opacity: 0 }, { opacity: 0, offset: 0.1 }, { opacity: 1, offset: 0.5 }, { opacity: 1 }], timing),
            rig.lid.animate(
                [{ transform: "rotateY(-178deg)" }, { transform: "rotateY(-178deg)", offset: 0.3 }, { transform: "rotateY(0deg)", offset: 0.8 }, { transform: "rotateY(0deg)" }],
                { ...timing, easing: HINGE }
            ),
            rig.wash.animate([{ opacity: 1 }, { opacity: 1, offset: 0.1 }, { opacity: 0, offset: 0.4 }, { opacity: 0 }], timing),
            rig.edge.animate([{ opacity: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 1 }], timing),
        ];
        if (skipped) finishAll(animations);
        await Promise.race([settled(animations), wait(win, MOTION.shotPatience)]);
        for (const animation of animations) animation.cancel();
        cover.removeClass(c("shelf-cover--in-shot"));
        done();
    })();
    return true;
}

/**
 * The book's cover on the shelf, once the Library has drawn it and the sidebars have finished
 * coming back: its place has stopped moving for two frames. Gives up after a moment.
 */
async function coverOnShelf(doc: Document, win: Window, bookId: string): Promise<HTMLElement | null> {
    const frame = () => new Promise<void>((resolve) => win.requestAnimationFrame(() => resolve()));
    const started = Date.now();
    let last = "";
    let still = 0;
    while (Date.now() - started < MOTION.shotPatience) {
        await frame();
        const card = Array.from(doc.querySelectorAll<HTMLElement>(`[data-zf-book]`)).find((el) => el.dataset.zfBook === bookId);
        if (!card) continue;
        const box = rectOf(card);
        const key = `${Math.round(box.left)},${Math.round(box.top)},${Math.round(box.width)}`;
        still = key === last && box.width > 0 ? still + 1 : 0;
        last = key;
        if (still >= 2) return card;
    }
    return null;
}
