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

/** The ways a reading can be chosen (#669) — kept in step with the State layer's kinds. */
export const READING_KINDS = ["around", "argument", "story", "essentials", "region", "selection"] as const;
export type ReaderKind = (typeof READING_KINDS)[number];

export interface ReaderState {
    seed?: string;
    chapter?: number;
    /** How the chapters were chosen. Absent: around the seed (#668). */
    kind?: ReaderKind;
    /** A selection's chapters, in reading order — a picked set is not rebuilt, it is kept. */
    paths?: string[];
    /** Whether each sidebar was collapsed before the reader opened. */
    restore?: ReaderSidesState;
    /** One-shot (#671): land on this highlight — a thought id — when its chapter is drawn. */
    highlight?: string;
    /** A saved reading's name (#672), shown on the title line instead of how it was chosen. */
    name?: string;
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
    if (typeof value.kind === "string" && (READING_KINDS as readonly string[]).includes(value.kind)) {
        state.kind = value.kind as ReaderKind;
    }
    if (Array.isArray(value.paths)) {
        const paths = value.paths.filter((p): p is string => typeof p === "string" && p.length > 0);
        if (paths.length > 0) state.paths = paths;
    }
    if (typeof value.highlight === "string" && value.highlight.length > 0) state.highlight = value.highlight;
    if (typeof value.name === "string" && value.name.trim().length > 0) state.name = value.name.trim();
    const restore = value.restore as Record<string, unknown> | undefined;
    if (restore && typeof restore.left === "boolean" && typeof restore.right === "boolean") {
        state.restore = { left: restore.left, right: restore.right };
    }
    return state;
}
