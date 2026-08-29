/**
 * Small accessibility helpers for our custom (non-`<button>`) interactive widgets (#319 E4, S3).
 *
 * Many surfaces render a clickable `<span>` (a note name, a candidate, a result). A bare click handler
 * is invisible to keyboard and screen-reader users. {@link makeActivatable} promotes such an element to
 * a first-class control: focusable, with an ARIA role, activated by both click and Enter/Space.
 */

/**
 * Make a non-button element keyboard-operable and screen-reader-announced. Adds the ARIA `role`, makes
 * it focusable (`tabindex=0`), and fires `onActivate` on click **and** on Enter/Space. Idempotent per
 * element per render (elements are recreated on re-render, so listeners are discarded with them).
 */
export function makeActivatable(
    el: HTMLElement,
    onActivate: () => void,
    role: "link" | "button" = "link"
): void {
    el.setAttribute("role", role);
    el.tabIndex = 0;
    el.addEventListener("click", onActivate);
    el.addEventListener("keydown", (evt) => {
        if (evt.key === "Enter" || evt.key === " ") {
            evt.preventDefault();
            onActivate();
        }
    });
}
