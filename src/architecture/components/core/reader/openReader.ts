import { Platform, type App, type WorkspaceLeaf } from "obsidian";
import { READER_VIEW, type ReaderBack, type ReaderKind, type ReaderSidesState } from "./readerContract";
import { LIBRARY_VIEW } from "architecture/components/core/library/libraryHost";
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
 * **Read from here** (#668): open the reader on a note — or on one way through it, or on a set you
 * picked (#669) — taking the window.
 *
 * There is only one reader. Opening again — from another note — re-reads in the same leaf and keeps
 * the snapshot it took the first time, so the workspace it gives back is the one you had before
 * any reading started.
 */
/** What to read: a note (around it, by default), one way through it, or a set you picked. */
export interface ReaderRequest {
    seed: string;
    kind?: ReaderKind;
    /** A picked set's chapters, already in reading order (see `selectionFor`). */
    paths?: string[];
    /** Where to open — a resumed reading starts part-way through. */
    chapter?: number;
    /** A highlight to land on (#671): opened from Think or a note's story. */
    highlight?: string;
    /** A saved reading's name (#672). */
    name?: string;
    /** A PDF or an EPUB to read instead of a note (#681, #682); `seed` is then ignored. */
    source?: string;
    /** Read in this leaf — the Library's own (#733): a camera move, never a new tab. */
    leaf?: WorkspaceLeaf;
    /** The Library's state to give the leaf back to on exit (#733). */
    back?: ReaderBack;
}

export async function openReader(app: App, request: string | ReaderRequest): Promise<void> {
    const { seed, kind, paths, chapter = 0, highlight, name, source, leaf: given, back } = typeof request === "string" ? { seed: request } as ReaderRequest : request;
    const { workspace } = app;
    if (!held) {
        const s = sides(app);
        held = { sides: s ? snapshotSides(s.left, s.right) : null, leaf: workspace.getMostRecentLeaf() };
        if (s) collapseSides(s.left, s.right);
    }
    // There is only one reader: read in the leaf you are given (the Library's), closing any other.
    if (given) for (const other of workspace.getLeavesOfType(READER_VIEW)) if (other !== given) other.detach();
    const leaf = given ?? workspace.getLeavesOfType(READER_VIEW)[0] ?? workspace.getLeaf("tab");
    // A source opened by its path — from the Library, its own menu, or Think's "Open in the Reader".
    const book = source ?? (/\.(pdf|epub)$/i.test(seed) ? seed : undefined);
    const state: Record<string, unknown> = book ? { source: book, chapter } : { seed, chapter };
    if (!book && kind && kind !== "around") state.kind = kind;
    if (!book && paths && paths.length > 0) state.paths = paths;
    if (highlight) state.highlight = highlight;
    if (name) state.name = name;
    if (back) state.back = back;
    await leaf.setViewState({ type: READER_VIEW, state, active: true });
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

/**
 * Leave the reader and give the workspace back. A reading opened from the Library hands its leaf
 * back to the Library as it was (#733); any other closes its leaf.
 */
export function exitReader(app: App, leaf: WorkspaceLeaf, back?: ReaderBack | null): void {
    restoreWorkspace(app);
    if (back) void leaf.setViewState({ type: LIBRARY_VIEW, state: back, active: true });
    else leaf.detach();
}

/** Test seam: forget any held snapshot. */
export function resetReaderWorkspace(): void {
    held = null;
}
