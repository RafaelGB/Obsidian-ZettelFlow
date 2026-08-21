import { App } from "obsidian";
import ZettelFlow from "main";
import { appendHistory } from "application/notes/historyUtils";
import { ModeHostView } from "architecture/components/core/surface/ModeHostView";

/**
 * Record a newly built note in history and refresh any open Home surface (#272, replaces the old
 * `HistoryView.record`). The Recent mode of the Home surface reads `plugin.settings.history`, so a
 * refresh re-renders it; refreshing Home while another mode is active is a harmless recompute.
 */
export function recordHistory(app: App, plugin: ZettelFlow, notePath: string, canvasPath: string): void {
    plugin.settings.history = appendHistory(plugin.settings.history ?? [], {
        notePath,
        canvasPath,
        createdAt: Date.now(),
    });
    void plugin.saveSettings();
    app.workspace.getLeavesOfType("zettelflow-home").forEach((leaf) => {
        const view = leaf.view;
        if (view instanceof ModeHostView) view.refresh();
    });
}
