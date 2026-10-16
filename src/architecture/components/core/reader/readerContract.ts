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
    /**
     * A PDF or an EPUB in the vault (#681, #682) — or an article, a note read as one (#744): the
     * reading is the source, its chapters are its pages, spine items or sections, and `chapter` is
     * the place in it.
     */
    source?: string;
    /**
     * A PDF drawn as its pages were laid out (#681), or reflowed into the column — said by the tab or a
     * link (#813 FR-23), it wins over the view remembered or suggested for the paper.
     */
    layout?: "page" | "reading";
    /**
     * Opened from the Library in its own leaf (#733, epic #729): the Library's state to give that
     * leaf back to on exit — its filter, sort, scroll and the book to come back to. Flat values only.
     */
    back?: ReaderBack;
    /**
     * One-shot (#751): land on this place — a passage a note goes back to, serialised by
     * `serializePlace` (its file, chapter and opening words). Resolved when the source is read.
     */
    at?: string;
    /**
     * One-shot (#762): open the claim sheet for this thought — an accepted *What's the claim* — its
     * sentence prefilled. Think's *Claim* opens the Reader on the passage with it.
     */
    claimFrom?: string;
}

/** The Library's view state a reading returns to (#733): flat, so a restored workspace can carry it. */
export type ReaderBack = Record<string, string | number | boolean>;

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
    if (typeof value.source === "string" && /\.(pdf|epub|md)$/i.test(value.source)) state.source = value.source;
    if (value.layout === "page" || value.layout === "reading") state.layout = value.layout;
    if (typeof value.at === "string" && value.at.length > 0 && value.at.length <= 4096) state.at = value.at;
    if (typeof value.claimFrom === "string" && value.claimFrom.length > 0 && value.claimFrom.length <= 512) state.claimFrom = value.claimFrom;
    if (value.back !== null && typeof value.back === "object" && !Array.isArray(value.back)) {
        const back: ReaderBack = {};
        for (const [key, item] of Object.entries(value.back as Record<string, unknown>)) {
            if (typeof item === "string" || typeof item === "boolean" || (typeof item === "number" && Number.isFinite(item))) back[key] = item;
        }
        state.back = back;
    }
    const restore = value.restore as Record<string, unknown> | undefined;
    if (restore && typeof restore.left === "boolean" && typeof restore.right === "boolean") {
        state.restore = { left: restore.left, right: restore.right };
    }
    return state;
}
