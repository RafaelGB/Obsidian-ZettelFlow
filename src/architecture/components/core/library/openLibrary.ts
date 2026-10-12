import type { App } from "obsidian";
import { LIBRARY_VIEW } from "./libraryHost";

/**
 * **Open the Library** (#680) — in the main area, the way a surface opens: the one already open is
 * reused, so the shelf is never there twice. `detail` opens a source's detail on arrival — the
 * file menu's *Show in the library*.
 */
export async function openLibrary(app: App, detail?: string, notebook?: string, field?: string): Promise<void> {
    const { workspace } = app;
    const leaf = workspace.getLeavesOfType(LIBRARY_VIEW)[0] ?? workspace.getLeaf("tab");
    // `notebook` opens a source's notebook on arrival (#721) — the Reader's Contents → Notebook.
    // `field` (#768 FR-4): the detail opens at that field of its Details — Cite's *Add it*.
    const state = notebook ? { notebook } : detail ? { detail, ...(field ? { field } : {}) } : {};
    await leaf.setViewState({ type: LIBRARY_VIEW, state, active: true });
    await workspace.revealLeaf(leaf);
}
