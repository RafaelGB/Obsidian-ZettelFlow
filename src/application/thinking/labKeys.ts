/**
 * Reaching the Lab's moves from the keyboard (#476, epic #472) — pure.
 *
 * Every move was a button that appears on hover. That is fine for a surface you visit; it is
 * wrong for the place an idea starts. Reaching for the pointer mid-sentence is the same
 * interruption as being asked for a title — except it happens every time instead of once.
 *
 * One table, read by both the key handler and the legend. The same reasoning as the write seam:
 * a list that lives in one place cannot drift from the thing it describes, and a guardrail
 * derives the moves from the surface rather than trusting this file to be complete.
 */

/** Everything the Lab can do to a thought, or to the lab itself. */
export type LabMove =
    | "fork"
    | "challenge"
    | "connect"
    | "pick"
    | "setAside"
    | "decidedAgainst"
    | "discard"
    | "crystallize"
    | "next"
    | "previous"
    | "leave";

export interface LabKey {
    move: LabMove;
    /** The `KeyboardEvent.key`, lowercased. */
    key: string;
    /** Whether it needs a modifier. */
    shift?: boolean;
    /** The i18n key naming the move, so the legend and the tooltip agree. */
    labelKey: string;
    /**
     * Whether it removes something. **Never on a bare single key**: a stray keystroke in a place
     * you were told is safe must not be able to throw a thread away.
     */
    destructive?: boolean;
}

export const LAB_KEYS: readonly LabKey[] = [
    { move: "next", key: "j", labelKey: "lab_key_next" },
    { move: "previous", key: "k", labelKey: "lab_key_previous" },
    { move: "fork", key: "f", labelKey: "lab_fork" },
    { move: "challenge", key: "c", labelKey: "lab_challenge" },
    { move: "connect", key: "l", labelKey: "lab_connect" },
    { move: "pick", key: "x", labelKey: "lab_pick" },
    { move: "crystallize", key: "y", labelKey: "lab_crystallize" },
    { move: "setAside", key: "s", labelKey: "lab_set_aside" },
    { move: "decidedAgainst", key: "a", shift: true, labelKey: "lab_decided_against", destructive: true },
    { move: "discard", key: "d", shift: true, labelKey: "lab_discard", destructive: true },
    { move: "leave", key: "escape", labelKey: "lab_key_leave" },
];

/** The move a keystroke means, or nothing. Case-insensitive; `Shift` is part of the identity. */
export function moveFor(key: string, shift: boolean): LabMove | undefined {
    const pressed = key.toLowerCase();
    return LAB_KEYS.find((entry) => entry.key === pressed && Boolean(entry.shift) === shift)?.move;
}

/** How a key reads in the legend: `Shift+D`, `Esc`, `f`. */
export function keyLabel(entry: LabKey): string {
    const name = entry.key === "escape" ? "Esc" : entry.key.toUpperCase();
    return entry.shift ? `Shift+${name}` : name;
}

/** The entry for a move, for a tooltip that wants to show its key. */
export function keyFor(move: LabMove): LabKey | undefined {
    return LAB_KEYS.find((entry) => entry.move === move);
}
