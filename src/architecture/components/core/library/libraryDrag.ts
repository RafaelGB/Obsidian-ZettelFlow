import { meterGesture, type GestureMeter } from "architecture/monitoring/frameMeter";
import type { Component } from "obsidian";
import { c } from "architecture";
import type { ShelfItem } from "application/library/shelf";
import { LONG_PRESS_MS, SLOP_PX } from "architecture/components/core/reader/readerGestures";

/**
 * **Putting a book on a shelf by hand** (#821) — drag on a desktop, long-press and drag on a touch
 * screen. Nothing here decides or writes: the Library says which shelf may take which book (`canDrop`)
 * and what a drop does (`drop`).
 *
 * - **Desktop**: the native drag, its ghost the cover. One shelf lights at a time; a shelf that
 *   refuses the book is never lit and the pointer says *not allowed*. Esc, or a drop outside, ends
 *   the drag with nothing written.
 * - **Touch and pen**: a press held as long as the Reader's long-press, without moving more than its
 *   slop, lifts the book; until then a swipe is the shelf's own sideways scroll. The lifted book
 *   follows the finger as a copy of its cover, moved only by a transform.
 */

export interface DragHooks {
    /** Whether the shelf `bay` takes the book. */
    canDrop: (item: ShelfItem, bay: HTMLElement) => boolean;
    /** The book was let go over `bay`, which takes it. */
    drop: (item: ShelfItem, bay: HTMLElement) => void;
    /** The shelf under a point; the document's own unless a test hands one in. */
    bayAt?: (x: number, y: number) => HTMLElement | null;
    /** Where the lifted copy is drawn: over the shelves. */
    layer: () => HTMLElement | null;
    /** A book is carried, or no longer (`null`): the cabinet says it will take it (#865 FR-16). */
    carrying?: (item: ShelfItem | null) => void;
    /** Near the scroller's edge the shelves scroll to meet the book (#865 FR-16, AC-19). */
    edge?: Pick<EdgeScroller, "move" | "stop">;
}

/** How deep the edge zone is, and how far one frame scrolls at the very edge. */
export const EDGE_ZONE_PX = 72;
export const EDGE_MAX_STEP_PX = 18;

/**
 * How far the shelves scroll this frame for a pointer at `y` in a scroller from `top` to `bottom`
 * (#865 AC-19): nothing outside the edge zones, down near the bottom, up near the top — faster the
 * nearer the edge. Pure.
 */
export function edgeScrollStep(y: number, top: number, bottom: number): number {
    const zone = Math.min(EDGE_ZONE_PX, (bottom - top) / 4);
    if (!(zone > 0)) return 0;
    const depth = (into: number) => Math.ceil(EDGE_MAX_STEP_PX * Math.min(1, Math.max(0, into) / zone));
    if (y > bottom - zone) return depth(y - (bottom - zone));
    if (y < top + zone) return -depth(top + zone - y);
    return 0;
}

/**
 * The shelves scrolling under a carried book (#865 FR-16): one frame loop, which runs while the pointer
 * is in an edge zone — a finger held still there keeps scrolling — and stops when it leaves the zone
 * or the book is let go. Writes nothing.
 */
export class EdgeScroller {
    private y: number | null = null;
    private frame = 0;

    constructor(private readonly scroller: () => HTMLElement | null) {}

    public move(y: number): void {
        this.y = y;
        if (!this.frame) this.tick();
    }

    public stop(): void {
        this.y = null;
        const win = this.scroller()?.win ?? window;
        if (this.frame) win.cancelAnimationFrame?.(this.frame);
        this.frame = 0;
    }

    private readonly tick = (): void => {
        this.frame = 0;
        const el = this.scroller();
        if (!el || this.y === null) return;
        const box = el.getBoundingClientRect();
        const step = edgeScrollStep(this.y, box.top, box.bottom);
        if (step === 0) return;
        el.scrollTop += step;
        this.frame = (el.win ?? window).requestAnimationFrame(this.tick);
    };
}

const BAY = "[data-zf-drop]";
const LIFTED = c("shelf-book--lifted");
const TARGET = c("shelf-bay--drop");

/** The book being dragged on a desktop — one at a time, across every Library leaf. */
let dragging: ShelfItem | null = null;

function light(root: ParentNode | null | undefined, bay: HTMLElement | null): void {
    for (const lit of Array.from(root?.querySelectorAll?.<HTMLElement>(`.${TARGET}`) ?? [])) if (lit !== bay) lit.removeClass(TARGET);
    bay?.addClass(TARGET);
}

/** A shelf that books can be put on. */
/**
 * A desktop drag's frames (#826): kept beside `dragging`, because a drop that redraws the shelf takes
 * the dragged book away, and a detached drag source never hears its `dragend`.
 */
let nativeMeter: GestureMeter | null = null;

export function dropTarget(bay: HTMLElement, hooks: DragHooks, scope: Component): void {
    bay.setAttr("data-zf-drop", "true");
    scope.registerDomEvent(bay, "dragover", (event: DragEvent) => {
        if (!dragging || !hooks.canDrop(dragging, bay)) {
            // Not lit, and the browser shows that it is refused.
            bay.removeClass(TARGET);
            return;
        }
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        light(bay.parentElement, bay);
    });
    scope.registerDomEvent(bay, "dragleave", (event: DragEvent) => {
        const to = event.relatedTarget as Node | null;
        if (!to || !bay.contains(to)) bay.removeClass(TARGET);
    });
    scope.registerDomEvent(bay, "drop", (event: DragEvent) => {
        const item = dragging;
        bay.removeClass(TARGET);
        if (!item || !hooks.canDrop(item, bay)) return;
        event.preventDefault();
        dragging = null;
        // A drop that redraws the shelf takes the dragged book away, and its dragend with it.
        hooks.edge?.stop();
        hooks.carrying?.(null);
        // The drop may redraw the shelf and take the dragged book away: its frames end here.
        nativeMeter?.end("drop");
        nativeMeter = null;
        hooks.drop(item, bay);
    });
}

/** A book that can be picked up: dragged on a desktop, long-pressed on a touch screen. */
export function draggable(book: HTMLElement, cover: HTMLElement, item: ShelfItem, hooks: DragHooks, scope: Component): void {
    book.setAttr("draggable", "true");
    // Its frames, while a developer's frame meter is on (#826): the shelves lighting under the book.
    let meter: GestureMeter | null = null;
    scope.registerDomEvent(book, "dragstart", (event: DragEvent) => {
        dragging = item;
        book.addClass(LIFTED);
        nativeMeter?.end();
        nativeMeter = meterGesture("shelf-drag:native", "tracked", book.win);
        nativeMeter.moved();
        hooks.carrying?.(item);
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", item.title);
            event.dataTransfer.setDragImage?.(cover, 0, 0);
        }
    });
    // The pointer, while the book is dragged: near an edge the shelves scroll to meet it.
    scope.registerDomEvent(book, "drag", (event: DragEvent) => {
        if (event.clientY) hooks.edge?.move(event.clientY);
    });
    scope.registerDomEvent(book, "dragend", () => {
        nativeMeter?.end();
        nativeMeter = null;
        dragging = null;
        hooks.edge?.stop();
        hooks.carrying?.(null);
        book.removeClass(LIFTED);
        light(book.closest(`.${c("shelf-shelf-host")}`), null);
    });

    // ── touch and pen: hold, then drag ──────────────────────────────────────────────
    let press: { id: number; x: number; y: number; timer: number } | null = null;
    let lifted: { ghost: HTMLElement | null; bay: HTMLElement | null } | null = null;
    let swallowClick = false;
    const bayAt = hooks.bayAt ?? ((x: number, y: number) => book.doc?.elementFromPoint?.(x, y)?.closest<HTMLElement>(BAY) ?? null);
    const end = () => {
        if (press) window.clearTimeout(press.timer);
        press = null;
        meter?.end();
        meter = null;
        if (lifted) {
            lifted.ghost?.remove();
            light(book.closest(`.${c("shelf-shelf-host")}`), null);
            hooks.edge?.stop();
            hooks.carrying?.(null);
        }
        lifted = null;
        book.removeClass(LIFTED);
    };
    scope.registerDomEvent(book, "pointerdown", (event: PointerEvent) => {
        if (event.pointerType === "mouse" || event.isPrimary === false) return;
        end();
        const start = { id: event.pointerId, x: event.clientX, y: event.clientY, timer: 0 };
        start.timer = window.setTimeout(() => {
            if (press !== start) return;
            // Lifted: the book is in your hand, and the shelf stops scrolling under it.
            book.addClass(LIFTED);
            const layer = hooks.layer();
            let ghost: HTMLElement | null = null;
            if (layer) {
                ghost = layer.createDiv({ cls: c("shelf-ghost"), attr: { "aria-hidden": "true" } });
                ghost.appendChild(cover.cloneNode(true));
                ghost.setCssProps({ "--zf-ghost-x": `${start.x}px`, "--zf-ghost-y": `${start.y}px` });
            }
            lifted = { ghost, bay: null };
            hooks.carrying?.(item);
            meter = meterGesture("shelf-drag", "tracked", book.win);
            book.setPointerCapture?.(start.id);
        }, LONG_PRESS_MS);
        press = start;
    });
    scope.registerDomEvent(book, "pointermove", (event: PointerEvent) => {
        if (!press || event.pointerId !== press.id) return;
        if (!lifted) {
            // Moved before the press: a swipe, the shelf's own.
            if (Math.hypot(event.clientX - press.x, event.clientY - press.y) >= SLOP_PX) end();
            return;
        }
        meter?.moved();
        hooks.edge?.move(event.clientY);
        lifted.ghost?.setCssProps({ "--zf-ghost-x": `${event.clientX}px`, "--zf-ghost-y": `${event.clientY}px` });
        const bay = bayAt(event.clientX, event.clientY);
        lifted.bay = bay && hooks.canDrop(item, bay) ? bay : null;
        light(book.closest(`.${c("shelf-shelf-host")}`), lifted.bay);
    });
    scope.registerDomEvent(book, "pointerup", (event: PointerEvent) => {
        if (!press || event.pointerId !== press.id) return;
        const bay = lifted?.bay ?? null;
        const was = Boolean(lifted);
        end();
        if (!was) return;
        // The click a lift ends with opens nothing.
        swallowClick = true;
        window.setTimeout(() => (swallowClick = false), 0);
        if (bay) hooks.drop(item, bay);
    });
    scope.registerDomEvent(book, "pointercancel", end);
    scope.registerDomEvent(book, "touchmove", (event: TouchEvent) => {
        if (lifted) event.preventDefault();
    }, { passive: false });
    scope.registerDomEvent(book, "click", (event: MouseEvent) => {
        if (!swallowClick) return;
        swallowClick = false;
        event.preventDefault();
        event.stopPropagation();
    }, { capture: true });
    scope.register(end);
}
