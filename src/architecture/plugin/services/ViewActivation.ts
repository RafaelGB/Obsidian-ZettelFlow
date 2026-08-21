import type { App } from "obsidian";

/**
 * Opens a ZettelFlow view of the given type as a normal main-area **tab**, or reveals the existing
 * leaf if one is already open (never opens a second leaf of the same type). Opening as a tab lets a
 * surface behave like any Obsidian document — moved, split or pinned by the user (#268 S1). Shared by
 * the command palette entries, the ribbon menu and the settings-tab launchers so all behave
 * identically. (Name kept for caller stability; it no longer forces the sidebar.)
 */
export async function activateSidebarView(app: App, viewType: string): Promise<void> {
    const { workspace } = app;
    const existing = workspace.getLeavesOfType(viewType);
    if (existing.length > 0) {
        void workspace.revealLeaf(existing[0]);
        return;
    }
    const leaf = workspace.getLeaf("tab");
    if (leaf) {
        await leaf.setViewState({ type: viewType, active: true });
        void workspace.revealLeaf(leaf);
    }
}
