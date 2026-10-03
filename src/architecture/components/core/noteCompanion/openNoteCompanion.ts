import type { App } from "obsidian";
import type { NextMoveToken } from "architecture/knowledge/state";
import { NOTE_COMPANION_VIEW, type CompanionFocus, type NoteCompanionState } from "./noteCompanionContract";

export interface CompanionRequest {
    /** Show this note. Absent: keep showing what it shows (or follow the active note). */
    path?: string;
    /** Land here on arrival (#641 next step, #644 Tend hand-over). */
    focus?: CompanionFocus;
    /** The move to preselect when `focus` is `next`. */
    move?: NextMoveToken;
}

/** An open in progress. A second request waits for it, so two callers never make two views. */
let opening: Promise<void> | null = null;

/**
 * The one way to open **This note** (#640 FR-1/2/20).
 *
 * There is only ever one: an existing companion is updated and revealed where it is — a user who
 * dragged it into the main area keeps it there — and only when there is none is a leaf made, in
 * the right sidebar, where Backlinks and Outline live. Revealing it does not take the focus from
 * the editor you are typing in. Requests are serialised: a restored workspace can ask several times
 * at once (one per retired leaf), and the second must find the first one's view.
 */
export async function openNoteCompanion(app: App, request: CompanionRequest = {}): Promise<void> {
    while (opening) await opening;
    opening = open(app, request).finally(() => {
        opening = null;
    });
    return opening;
}

async function open(app: App, request: CompanionRequest): Promise<void> {
    const state: NoteCompanionState & Record<string, unknown> = {};
    if (request.path) state.path = request.path;
    if (request.focus) state.focus = request.focus;
    if (request.move) state.move = request.move;

    const existing = app.workspace.getLeavesOfType(NOTE_COMPANION_VIEW)[0];
    if (existing) {
        // After a restart a leaf can be deferred: load it first, so the state reaches the real view.
        await (existing as { loadIfDeferred?: () => Promise<void> }).loadIfDeferred?.();
        await existing.setViewState({ type: NOTE_COMPANION_VIEW, state, active: false });
        await app.workspace.revealLeaf(existing);
        return;
    }
    await app.workspace.ensureSideLeaf(NOTE_COMPANION_VIEW, "right", { active: false, reveal: true, state });
}
