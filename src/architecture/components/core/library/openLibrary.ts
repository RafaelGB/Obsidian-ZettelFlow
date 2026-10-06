import type { App } from "obsidian";
import { LIBRARY_VIEW } from "./libraryHost";

/**
 * **Open the Library** (#680) — in the main area, the way a surface opens: the one already open is
 * reused, so the shelf is never there twice. `detail` opens a source's detail on arrival — the
 * file menu's *Show in the library*.
 */
export async function openLibrary(app: App, detail?: string): Promise<void> {
    const { workspace } = app;
    const leaf = workspace.getLeavesOfType(LIBRARY_VIEW)[0] ?? workspace.getLeaf("tab");
    await leaf.setViewState({ type: LIBRARY_VIEW, state: detail ? { detail } : {}, active: true });
    await workspace.revealLeaf(leaf);
}
