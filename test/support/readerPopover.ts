import type { DomNode } from "./dashboardDom";

/**
 * The selection popover's routes (#811): its rows, and *More* opened. An action is found where its
 * row put it — a test that only wants to press it opens *More* first and looks in the whole popover.
 */

/** Press *More* when the popover has it and it is folded; the popover, either way. */
export function openMore(pop: DomNode | undefined): DomNode {
    if (!pop) throw new Error("no popover");
    const toggle = pop.byClass("reader-hl-more-toggle")[0];
    if (toggle && toggle.getAttribute("aria-expanded") !== "true") toggle.click();
    return pop;
}

/** The labels of one row's buttons, in order: `reader-hl-first`, `-second`, `-more-list`, `-think`. */
export function rowLabels(root: DomNode, row: string): string[] {
    const el = root.byClass(row)[0];
    return el ? el.findAll((node) => node.tag === "button").map((button) => button.textContent) : [];
}
