/**
 * Which note the companion is showing (#640 FR-3/4/6) — a pure reducer over workspace events.
 *
 * The view feeds it `file-open`, rename and delete; the head block feeds it pin and follow. Keeping
 * the rules here means the awkward cases (a pinned note renamed, a pinned note deleted, a canvas in
 * front of you) are decided once and proved by tests, not re-decided inside listeners.
 */
export interface SubjectState {
    /** The note on screen, or null for the empty state. */
    shown: string | null;
    /** Stay on `shown` while other notes are opened. */
    pinned: boolean;
    /** The most recent note shown — what the empty state offers to reopen. */
    last: string | null;
}

export type SubjectEvent =
    /** The active file changed. `markdown` is false for a canvas, an image, a PDF. */
    | { kind: "active"; path: string | null; markdown: boolean }
    | { kind: "rename"; from: string; to: string }
    /** A file was deleted; `active` is the markdown note to fall back to, if any. */
    | { kind: "delete"; path: string; active: string | null }
    | { kind: "pin" }
    /** Unpin and go back to whatever note is active. */
    | { kind: "follow"; active: string | null }
    /** Show this note because someone asked for it by name (a deep link). */
    | { kind: "open"; path: string };

export const INITIAL_SUBJECT: SubjectState = { shown: null, pinned: false, last: null };

function showing(path: string | null, pinned: boolean, last: string | null): SubjectState {
    return { shown: path, pinned: path !== null && pinned, last: path ?? last };
}

export function reduceSubject(state: SubjectState, event: SubjectEvent): SubjectState {
    switch (event.kind) {
        case "active":
            if (state.pinned) return state;
            return showing(event.markdown ? event.path : null, false, state.last);
        case "rename": {
            if (state.shown !== event.from && state.last !== event.from) return state;
            return {
                shown: state.shown === event.from ? event.to : state.shown,
                pinned: state.pinned,
                last: state.last === event.from ? event.to : state.last,
            };
        }
        case "delete": {
            if (state.shown === event.path) return showing(event.active, false, null);
            if (state.last === event.path) return { ...state, last: state.shown };
            return state;
        }
        case "pin":
            return state.shown === null ? state : { ...state, pinned: true };
        case "follow":
            return showing(event.active, false, state.last);
        case "open":
            // Asked for by name: the pin, if there is one, moves with it.
            return showing(event.path, state.pinned, state.last);
    }
}
