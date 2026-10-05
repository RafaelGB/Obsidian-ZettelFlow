import { Platform, type App, type WorkspaceLeaf } from "obsidian";
import { READER_VIEW, type ReaderSidesState } from "./readerContract";
import { collapseSides, restoreSides, snapshotSides, type SideLike } from "./readerWorkspace";

/**
 * What the workspace looked like before the reader took it: the sidebars and the leaf you were in.
 * Held for the one reading in progress; cleared when it gives the workspace back.
 */
let held: { sides: ReaderSidesState | null; leaf: WorkspaceLeaf | null } | null = null;

/** The sides a desktop workspace has; none on mobile, where the reader never moves the drawers. */
function sides(app: App): { left: SideLike; right: SideLike } | null {
    if (Platform.isMobile) return null;
    const { leftSplit, rightSplit } = app.workspace as unknown as { leftSplit?: SideLike; rightSplit?: SideLike };
    return leftSplit && rightSplit ? { left: leftSplit, right: rightSplit } : null;
}

/** The sidebars the reader will give back, for a view that outlives a restart (see ReaderView). */
export function heldSides(): ReaderSidesState | null {
    return held?.sides ?? null;
}

/** A restored reader hands back what it remembered, so Esc still restores after a restart. */
export function adoptHeldSides(snapshot: ReaderSidesState): void {
    if (!held) held = { sides: snapshot, leaf: null };
}

/**
 * **Read from here** (#668): open the reader on `seed`, taking the window.
 *
 * There is only one reader. Opening again — from another note — re-reads in the same leaf and keeps
 * the snapshot it took the first time, so the workspace it gives back is the one you had before
 * any reading started.
 */
export async function openReader(app: App, seed: string): Promise<void> {
    const { workspace } = app;
    if (!held) {
        const s = sides(app);
        held = { sides: s ? snapshotSides(s.left, s.right) : null, leaf: workspace.getMostRecentLeaf() };
        if (s) collapseSides(s.left, s.right);
    }
    const leaf = workspace.getLeavesOfType(READER_VIEW)[0] ?? workspace.getLeaf("tab");
    await leaf.setViewState({ type: READER_VIEW, state: { seed, chapter: 0 }, active: true });
    await workspace.revealLeaf(leaf);
}

/**
 * Give the workspace back: the sidebars as they were, and the leaf you were in when it still exists.
 * Idempotent — closing the tab and pressing Esc both land here, and only the first one acts.
 */
export function restoreWorkspace(app: App): void {
    const snapshot = held;
    held = null;
    if (!snapshot) return;
    const s = sides(app);
    if (s && snapshot.sides) restoreSides(snapshot.sides, s.left, s.right);
    const leaf = snapshot.leaf;
    if (!leaf) return;
    let alive = false;
    app.workspace.iterateAllLeaves((other) => {
        if (other === leaf) alive = true;
    });
    if (alive) app.workspace.setActiveLeaf(leaf, { focus: true });
}

/** Leave the reader: close its leaf and give the workspace back. */
export function exitReader(app: App, leaf: WorkspaceLeaf): void {
    restoreWorkspace(app);
    leaf.detach();
}

/** Test seam: forget any held snapshot. */
export function resetReaderWorkspace(): void {
    held = null;
}
