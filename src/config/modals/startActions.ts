import type { App } from "obsidian";
import { activateSurface } from "architecture/plugin";

/**
 * The start card's third way in (#660): no setup, just think. It is the one thing the settings
 * tab launches, and only from the card shown while nothing creates notes — the panel otherwise
 * holds settings and only settings (#439).
 *
 * The settings modal covers the workspace, so it is closed first; `app.setting` is not in the
 * public API, the same reach Practice's "open settings" makes, and it is guarded.
 */
export function openCultivateFromSettings(app: App): void {
    (app as App & { setting?: { close?: () => void } }).setting?.close?.();
    void activateSurface(app, "zettelflow-home", "cultivate");
}
