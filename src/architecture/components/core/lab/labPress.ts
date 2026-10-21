import type { Component } from "obsidian";
import { LONG_PRESS_MS, SLOP_PX } from "architecture/components/core/reader/readerGestures";

/** What a tap in selection mode never toggles: the controls of the card, which do their own thing. */
const OWN_TAP = "textarea, input, button, a, select, [contenteditable]";

/**
 * **Picking a thought by finger** (#868 FR-7): a long press on a card picks it (or unpicks it), as a
 * touch screen's lists do; while anything is picked, a tap on the card toggles it. The mouse keeps
 * the checkbox. The press is the Reader's (`LONG_PRESS_MS`, `SLOP_PX`), so the two feel the same.
 *
 * A press may start on the card's text box while it is not being edited; the tap it ends with is
 * swallowed, so the box does not take focus and the keyboard does not open.
 */
export function pressToPick(card: HTMLElement, scope: Component, hooks: { pick(): void; picking(): boolean }): void {
    let press: { id: number; x: number; y: number; timer: number } | null = null;
    let pointer = "mouse";
    let swallow = false;
    const cancel = () => {
        if (press) window.clearTimeout(press.timer);
        press = null;
    };
    scope.registerDomEvent(card, "pointerdown", (event: PointerEvent) => {
        pointer = event.pointerType || "mouse";
        cancel();
        swallow = false;
        if (pointer === "mouse" || event.isPrimary === false) return;
        const target = event.target as HTMLElement | null;
        // Editing: the press is the text's own (the cursor, the selection), never a pick.
        if (target && target === target.ownerDocument?.activeElement && target.closest?.("textarea")) return;
        const start = { id: event.pointerId, x: event.clientX, y: event.clientY, timer: 0 };
        start.timer = window.setTimeout(() => {
            if (press !== start) return;
            press = null;
            swallow = true;
            hooks.pick();
        }, LONG_PRESS_MS);
        press = start;
    });
    scope.registerDomEvent(card, "pointermove", (event: PointerEvent) => {
        if (press && event.pointerId === press.id && Math.hypot(event.clientX - press.x, event.clientY - press.y) >= SLOP_PX) cancel();
    });
    scope.registerDomEvent(card, "pointerup", cancel);
    scope.registerDomEvent(card, "pointercancel", cancel);
    // The lift after a pick focuses nothing and clicks nothing.
    scope.registerDomEvent(card, "touchend", (event: TouchEvent) => {
        if (swallow) event.preventDefault();
    }, { passive: false });
    scope.registerDomEvent(card, "click", (event: MouseEvent) => {
        if (swallow) {
            swallow = false;
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        if (pointer === "mouse" || !hooks.picking()) return;
        const target = event.target as HTMLElement | null;
        if (target?.closest?.(OWN_TAP)) return;
        hooks.pick();
    }, { capture: true });
    scope.register(cancel);
}
