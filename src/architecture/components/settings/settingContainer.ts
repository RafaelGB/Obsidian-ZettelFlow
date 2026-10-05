import { Setting } from "obsidian";
import { c } from "architecture";

/**
 * A named container inside `parent` that survives a re-render: emptied and reused if it exists,
 * created once otherwise. The shared rule behind every container helper below.
 */
function namedContainer(parent: HTMLElement, name: string): HTMLElement {
    const cls = c(name);
    const existing = parent.querySelector<HTMLElement>(`:scope > .${cls}`);
    if (existing) {
        existing.empty();
        return existing;
    }
    return parent.createDiv({ cls });
}

/**
 * A container inside a settings row that survives a re-render (#440 follow-up).
 *
 * Obsidian's declarative tab keeps the `Setting` elements and calls `render` again on
 * `update()` — so a callback that does `settingEl.createDiv(...)` adds a **second** container
 * every time, and a toggle that re-renders the tab duplicates every dynamic list on it.
 *
 * Asking for the container by name instead of creating one blindly makes a render callback
 * idempotent, which is what the declarative API expects of it.
 */
export function rowContainer(setting: Setting, name: string): HTMLElement {
    return namedContainer(setting.settingEl, name);
}

/** The same, under the row's description — for a line that belongs to what the row says (#661). */
export function descContainer(setting: Setting, name: string): HTMLElement {
    return namedContainer(setting.descEl, name);
}

/** The same, in the row's control column — for a control the `Setting` API has no builder for (#661). */
export function controlContainer(setting: Setting, name: string): HTMLElement {
    return namedContainer(setting.controlEl, name);
}

/** Whether a row already holds this container — for renders that cannot simply be repeated. */
export function hasRowContainer(setting: Setting, name: string): boolean {
    return setting.settingEl.querySelector(`:scope > .${c(name)}`) !== null;
}
