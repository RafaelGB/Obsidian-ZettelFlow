/**
 * Small accessibility helpers for our custom (non-`<button>`) interactive widgets (#319 E4, S3).
 *
 * Many surfaces render a clickable `<span>` (a note name, a candidate, a result). A bare click handler
 * is invisible to keyboard and screen-reader users. {@link makeActivatable} promotes such an element to
 * a first-class control: focusable, with an ARIA role, activated by both click and Enter/Space.
 *
 * {@link hoverPreview} is the sibling for the *pointer*: it wires a note-name element to Obsidian's
 * native "Page preview" popover (#594), so a Ctrl/Cmd-hover shows the note without leaving the surface.
 */

import type { App } from "obsidian";

/**
 * The id ZettelFlow registers with the "Page preview" core plugin (#594). A `HoverPreviewComponent`
 * registers it once on load with `defaultMod: true`; every {@link hoverPreview} call emits under it.
 */
export const HOVER_PREVIEW_SOURCE = "zettelflow";

/** The `hover-link` event payload Obsidian's Page preview plugin consumes. */
export interface HoverPreviewPayload {
    event: MouseEvent;
    source: string;
    hoverParent: unknown;
    targetEl: HTMLElement;
    linktext: string;
    sourcePath: string;
}

/** Build the `hover-link` payload — pure, so it can be tested without a DOM (#594). */
export function hoverPreviewPayload(
    event: MouseEvent,
    el: HTMLElement,
    path: string,
    hoverParent: unknown
): HoverPreviewPayload {
    return { event, source: HOVER_PREVIEW_SOURCE, hoverParent, targetEl: el, linktext: path, sourcePath: "" };
}

/**
 * Show Obsidian's native **Page preview** when the pointer hovers `el` over the note at `path` (#594).
 *
 * Complements a click-to-open affordance (e.g. {@link makeActivatable}); it never replaces it, and it
 * **writes nothing** — the trigger only asks the core plugin to render a read-only popover. A **no-op**
 * when the "Page preview" core plugin is disabled: nothing listens for the event, and nothing throws.
 * Whether the Mod key is required is the source's `defaultMod` and the user's Page-preview settings.
 *
 * `hoverParent` is the view/component the popover attaches its lifecycle to (pass the renderer/`this`).
 */
export function hoverPreview(
    app: App,
    el: HTMLElement | SVGElement,
    path: string,
    hoverParent: unknown,
    /**
     * Where the popover anchors. Required for an SVG `el`: Obsidian's handler calls `isShown()` on
     * the target, which only HTML elements have (#639 — a graph node threw on every hover).
     */
    anchor?: HTMLElement
): void {
    // What Obsidian needs of the target is `isShown()` — HTML elements have it, SVG ones do not.
    const shown = (node: unknown): node is HTMLElement => typeof (node as { isShown?: unknown })?.isShown === "function";
    const target = anchor ?? (shown(el) ? el : null);
    if (!target) return;
    el.addEventListener("mouseover", (event) => {
        app.workspace.trigger("hover-link", hoverPreviewPayload(event as MouseEvent, target, path, hoverParent));
    });
}

/**
 * Make a non-button element keyboard-operable and screen-reader-announced. Adds the ARIA `role`, makes
 * it focusable (`tabindex=0`), and fires `onActivate` on click **and** on Enter/Space. Idempotent per
 * element per render (elements are recreated on re-render, so listeners are discarded with them).
 */
export function makeActivatable(
    el: HTMLElement | SVGElement,
    onActivate: () => void,
    role: "link" | "button" = "link"
): void {
    el.setAttribute("role", role);
    el.tabIndex = 0;
    el.addEventListener("click", onActivate);
    el.addEventListener("keydown", (event) => {
        const evt = event as KeyboardEvent;
        if (evt.key === "Enter" || evt.key === " ") {
            evt.preventDefault();
            onActivate();
        }
    });
}
