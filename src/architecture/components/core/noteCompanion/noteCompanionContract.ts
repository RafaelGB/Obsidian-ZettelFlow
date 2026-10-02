import { NEXT_MOVE_TOKENS, type NextMoveToken } from "architecture/knowledge/state";

/**
 * The **This note** companion's public contract (#640, epic #639) — pure data, no `obsidian`.
 *
 * Other parts of the product reach the companion through this and through `openNoteCompanion`:
 * Health › Tend hands a note over focused on its fix (#644), the next-step card claims `focus:
 * "next"` (#641). Keeping the shape here, parsed defensively, is what lets a deep link from a stale
 * workspace or a future slice never crash the view.
 */
export const NOTE_COMPANION_VIEW = "zettelflow-note";

/** Where a hand-over lands: the next-step card, or one of the sections. */
export type CompanionFocus = "next" | "nearby" | "gaps";

const FOCUSES: readonly CompanionFocus[] = ["next", "nearby", "gaps"];

export interface NoteCompanionState {
    /** The note to show. Absent: follow the active note. */
    path?: string;
    /** Stay on `path` while you open other notes. */
    pinned?: boolean;
    /** One-shot: where to land on arrival. Never persisted. */
    focus?: CompanionFocus;
    /** One-shot: which move to preselect when `focus` is `next`. Never persisted. */
    move?: NextMoveToken;
}

/** Read a view-state payload, keeping only the values the contract knows. Never throws. */
export function parseCompanionState(raw: unknown): NoteCompanionState {
    if (raw === null || typeof raw !== "object") return {};
    const value = raw as Record<string, unknown>;
    const state: NoteCompanionState = {};
    if (typeof value.path === "string" && value.path.length > 0) state.path = value.path;
    if (typeof value.pinned === "boolean") state.pinned = value.pinned;
    if (typeof value.focus === "string" && (FOCUSES as readonly string[]).includes(value.focus)) {
        state.focus = value.focus as CompanionFocus;
    }
    if (typeof value.move === "string" && (NEXT_MOVE_TOKENS as readonly string[]).includes(value.move)) {
        state.move = value.move as NextMoveToken;
    }
    return state;
}
