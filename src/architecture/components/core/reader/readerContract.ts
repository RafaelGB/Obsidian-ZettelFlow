/**
 * The **Reader**'s public shape (#668, epic #667) — pure data, no `obsidian`.
 *
 * The view's state is what a restored workspace hands back: which note the reading started from,
 * the chapter you were on, and how the sidebars looked before the reader took the window — so a
 * reader left open across a restart still gives the workspace back on exit.
 */
export const READER_VIEW = "zettelflow-reader";

export interface ReaderSidesState {
    left: boolean;
    right: boolean;
}

export interface ReaderState {
    seed?: string;
    chapter?: number;
    /** Whether each sidebar was collapsed before the reader opened. */
    restore?: ReaderSidesState;
}

/** Read a view-state payload, keeping only what the contract knows. Never throws. */
export function parseReaderState(raw: unknown): ReaderState {
    if (raw === null || typeof raw !== "object") return {};
    const value = raw as Record<string, unknown>;
    const state: ReaderState = {};
    if (typeof value.seed === "string" && value.seed.length > 0) state.seed = value.seed;
    if (typeof value.chapter === "number" && Number.isInteger(value.chapter) && value.chapter >= 0) {
        state.chapter = value.chapter;
    }
    const restore = value.restore as Record<string, unknown> | undefined;
    if (restore && typeof restore.left === "boolean" && typeof restore.right === "boolean") {
        state.restore = { left: restore.left, right: restore.right };
    }
    return state;
}
