/**
 * Who wrote (#453, epic #451) — pure.
 *
 * A record that says *a note was created* answers half the question. The half that matters when
 * you are looking at frontmatter you did not type is **which part of ZettelFlow did this**: the
 * flow you just ran, a property hook firing on a note you were not looking at, an action, or a
 * system you installed from the gallery.
 *
 * The origin is set once, by whoever starts the work, and every write underneath inherits it —
 * so a call site never has to invent a label.
 */

/** The parts of ZettelFlow that write. `manual` is a write you asked for directly, from a surface. */
export type WriteOriginKind = "flow" | "hook" | "action" | "install" | "manual" | "unknown";

export interface WriteOrigin {
    kind: WriteOriginKind;
    /** A stable reference: the flow's path, `hook:<property>`, the action's type, the system's name. */
    ref?: string;
    /** The step inside a flow, when there is one. */
    step?: string;
    /** What to call it on screen, when the reference is not readable on its own. */
    label?: string;
}

/** A write nobody claimed. Recorded rather than dropped: an unexplained write is still a fact. */
export const UNATTRIBUTED: WriteOrigin = Object.freeze({ kind: "unknown" });
