import { App } from "obsidian";

/**
 * Opens a sidebar view leaf of the given type, or reveals the existing one if already open
 * (never opens a second leaf of the same type). Shared by the command palette entries and the
 * settings-tab launchers so both behave identically.
 */
export async function activateSidebarView(app: App, viewType: string): Promise<void> {
    const { workspace } = app;
    const existing = workspace.getLeavesOfType(viewType);
    if (existing.length > 0) {
        void workspace.revealLeaf(existing[0]);
        return;
    }
    const leaf = workspace.getRightLeaf(false);
    if (leaf) {
        await leaf.setViewState({ type: viewType, active: true });
        void workspace.revealLeaf(leaf);
    }
}
