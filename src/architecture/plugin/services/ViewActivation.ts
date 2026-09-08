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

/**
 * Opens a ZettelFlow **surface** (#272) at an optional **mode**, or reveals+re-modes the existing
 * surface leaf. The mode is passed through the view state so the surface's `setState` switches to it —
 * this is how the retired `show-*` alias commands and dashboard jumps deep-link to a specific mode.
 * `extraState` rides along in the same payload so a caller can deep-link mode-specific data — e.g. a
 * Home pinned card opening *Ask your graph* pre-filled with its query (#323 G4).
 */
export async function activateSurface(
    app: App,
    surfaceViewType: string,
    mode?: string,
    extraState?: Record<string, unknown>
): Promise<void> {
    const { workspace } = app;
    const existing = workspace.getLeavesOfType(surfaceViewType);
    const leaf = existing.length > 0 ? existing[0] : workspace.getLeaf("tab");
    if (!leaf) return;
    const state = mode || extraState ? { ...(mode ? { mode } : {}), ...extraState } : undefined;
    await leaf.setViewState({ type: surfaceViewType, active: true, state });
    void workspace.revealLeaf(leaf);
}
