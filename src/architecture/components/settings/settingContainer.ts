import { Setting } from "obsidian";
import { c } from "architecture";

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
    const cls = c(name);
    const existing = setting.settingEl.querySelector<HTMLElement>(`:scope > .${cls}`);
    if (existing) {
        existing.empty();
        return existing;
    }
    return setting.settingEl.createDiv({ cls });
}

/** Whether a row already holds this container — for renders that cannot simply be repeated. */
export function hasRowContainer(setting: Setting, name: string): boolean {
    return setting.settingEl.querySelector(`:scope > .${c(name)}`) !== null;
}
