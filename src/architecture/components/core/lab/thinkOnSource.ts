import type { App } from "obsidian";
import { activateSurface } from "architecture/plugin/services/ViewActivation";

/**
 * **From the Reader into Think, already on the source** (#874 FR-6): *Open in Think* on a highlight and
 * *Think on what you marked* at a source's end both land here — Think filtered to that book, PDF or
 * note, in reading order. The source travels as a `source`, never as a subject: take its chip away and
 * the next thought is about nothing, as Think promised.
 */
export function thinkOnSource(app: App, path: string): void {
    void activateSurface(app, "zettelflow-home", "lab", { source: path });
}
