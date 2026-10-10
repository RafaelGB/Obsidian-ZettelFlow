/**
 * **The ink note** (#745 E4, epic #740) — pure.
 *
 * Strokes written together are one ink note: a word is several strokes, a margin remark a few words.
 * A stroke joins the note being written when it starts soon after the last one lifted and near it;
 * otherwise a new note begins (FR-9). A note is written once — when it goes idle, when the page turns
 * and when the Reader closes — and never while a stroke is in progress.
 *
 * The clock is the caller's, so a test runs on a fake one.
 */

/** A stroke that starts later than this after the last lift begins a new ink note. */
export const GROUP_IDLE_MS = 1500;
/** …and so does one that starts farther than this from the note, in ems of the reading text. */
export const GROUP_REACH_EM = 4;

export interface InkBox {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

/** Why a note is written now. */
export type FlushReason = "idle" | "turn" | "close";

export interface InkGroup<S> {
    strokes: S[];
    box: InkBox;
    /** When the last stroke lifted. */
    lastUpAt: number;
}

/** The gap between two boxes, 0 when they touch or overlap. */
export function gap(a: InkBox, b: InkBox): number {
    const dx = Math.max(0, a.left - b.right, b.left - a.right);
    const dy = Math.max(0, a.top - b.bottom, b.top - a.bottom);
    return Math.hypot(dx, dy);
}

/** Whether a stroke that began at `startedAt` and covers `box` joins `group`. `em` is px per em. */
export function joins(group: { box: InkBox; lastUpAt: number } | null, stroke: { box: InkBox; startedAt: number }, em: number): boolean {
    if (!group) return false;
    if (stroke.startedAt - group.lastUpAt > GROUP_IDLE_MS) return false;
    return gap(group.box, stroke.box) <= GROUP_REACH_EM * em;
}

function union(a: InkBox, b: InkBox): InkBox {
    return { left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) };
}

/**
 * The note being written, and the ones it closes. `penDown`/`penUp` bracket a stroke; `due` says
 * whether the open note has gone idle; `flush` hands it over to be written — never mid-stroke.
 */
export class InkGrouping<S> {
    private open: InkGroup<S> | null = null;
    private drawing = false;
    /** A stroke that lifted with no note open was the start of one that began when it went down. */
    private downAt = 0;

    /** The note being written, if any. */
    current(): InkGroup<S> | null {
        return this.open;
    }

    isDrawing(): boolean {
        return this.drawing;
    }

    penDown(at: number): void {
        this.drawing = true;
        this.downAt = at;
    }

    /**
     * A stroke lifted. Returns the note it closed — the open one, when this stroke does not join it —
     * which the caller writes now.
     */
    penUp(stroke: S, box: InkBox, at: number, em: number): InkGroup<S> | null {
        this.drawing = false;
        let closed: InkGroup<S> | null = null;
        if (this.open && !joins(this.open, { box, startedAt: this.downAt }, em)) {
            closed = this.open;
            this.open = null;
        }
        if (this.open) {
            this.open.strokes.push(stroke);
            this.open.box = union(this.open.box, box);
            this.open.lastUpAt = at;
        } else {
            this.open = { strokes: [stroke], box, lastUpAt: at };
        }
        return closed;
    }

    /** A stroke was abandoned (the system took the pointer): nothing joins, nothing closes. */
    cancel(): void {
        this.drawing = false;
    }

    /** Whether the open note has been idle long enough to be written. */
    due(now: number): boolean {
        return Boolean(this.open) && !this.drawing && now - (this.open?.lastUpAt ?? 0) >= GROUP_IDLE_MS;
    }

    /** Hand the open note over to be written — or nothing, while a stroke is in progress. */
    flush(reason: FlushReason, now: number): InkGroup<S> | null {
        if (this.drawing || !this.open) return null;
        if (reason === "idle" && !this.due(now)) return null;
        const group = this.open;
        this.open = null;
        return group;
    }

    /** Take a stroke back out of the open note (undo before it was written). Returns whether it was there. */
    remove(stroke: S): boolean {
        if (!this.open) return false;
        const at = this.open.strokes.indexOf(stroke);
        if (at === -1) return false;
        this.open.strokes.splice(at, 1);
        if (this.open.strokes.length === 0) this.open = null;
        return true;
    }

    /** Put a stroke back into the open note (redo), opening one if none is. */
    restore(stroke: S, box: InkBox, at: number): void {
        if (this.open) {
            this.open.strokes.push(stroke);
            this.open.box = union(this.open.box, box);
        } else {
            this.open = { strokes: [stroke], box, lastUpAt: at };
        }
    }
}
