/**
 * Committing an edit to what is left out (#713, FR-16): the rules, the previous version's folder
 * mirror, one save, then a rebuild once editing settles. Picking, searching and switching kind never
 * come here — only *Add*, *Save* and *Remove* do.
 */
import type { App } from "obsidian";
import type ZettelFlow from "main";
import { KnowledgeIndex } from "architecture/knowledge";
import { folderMirror, type ScopeRules } from "architecture/knowledge/scope/scopeRules";
import { ModeHostView } from "architecture/components/core/surface/ModeHostView";

let rebuildTimer: number | undefined;

/**
 * Refresh any open knowledge surface (Home / Cultivate / Timeline / Health, and the Graph) after a scope
 * change (#374), so an exclusion takes effect on-screen immediately — not only on the next vault event.
 */
export function refreshKnowledgeSurfaces(app: App): void {
    for (const type of ["zettelflow-home", "zettelflow-graph"]) {
        app.workspace.getLeavesOfType(type).forEach((leaf) => {
            if (leaf.view instanceof ModeHostView) leaf.view.refresh();
        });
    }
}

/** Store the rules (a new object, never mutated in place), mirror the folders, save once, rebuild. */
export async function commitScope(plugin: ZettelFlow, next: ScopeRules): Promise<void> {
    plugin.settings.knowledgeScope = { leaveOut: [...next.leaveOut], keep: [...next.keep] };
    // The previous version reads only this, for one release (#713): every folder rule it can say.
    plugin.settings.excludedPaths = folderMirror(next.leaveOut);
    await plugin.saveSettings();
    if (rebuildTimer) window.clearTimeout(rebuildTimer);
    // Reindex once editing settles, then refresh open surfaces so the change shows now.
    rebuildTimer = window.setTimeout(() => {
        KnowledgeIndex.getInstance().build();
        refreshKnowledgeSurfaces(plugin.app);
    }, 300);
}
