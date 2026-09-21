import type { Move } from "./move";

/**
 * **How you got here** (#494, epic #489) — the moves, as a story.
 *
 * The obvious way to show a move log is a table of verbs and timestamps, and it is the wrong one:
 * that is a log viewer. What is worth reading is the *shape* of what you did —
 *
 * > *"You captured this, challenged it the next morning, reframed it, and two readings came out
 * > of that."*
 *
 * — which is **epistemic provenance**, and the thing no note-taking tool tells you. It is not
 * version control: not what changed in the document, but what you did to the idea.
 *
 * This module does the one part of that which can be wrong: grouping consecutive moves into dated
 * lines, deterministically. The words belong to the i18n layer, so Spanish does not read as a
 * translation of a data structure, and the **line it must never cross** belongs to everyone: a
 * sequence of moves invites a conclusion, and the interface does not get to draw one. No density,
 * no depth, no "well developed". A locale scan enforces that, because a review note will not.
 *
 * Pure: no `obsidian`, no clock of its own.
 */

/** One dated line of the story: the day, and the moves that happened on it, in order. */
export interface ReplayLine {
    /** Unix ms of the first move on that day — what the view formats as a date. */
    day: number;
    moves: Move[];
}

/** The UTC day a moment falls in, as a sortable key. */
function dayKey(at: number): string {
    return new Date(at).toISOString().slice(0, 10);
}

/**
 * Group moves into dated lines, oldest first.
 *
 * Consecutive moves on the same day become one line — a story has paragraphs, and repeating the
 * date four times is how a story becomes a table. Days are UTC, matching the journal's own
 * day-keying, so a replay and a streak never disagree about when something happened.
 */
export function replayLines(moves: readonly Move[]): ReplayLine[] {
    const ordered = [...moves].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
    const lines: ReplayLine[] = [];
    let currentDay = "";
    for (const move of ordered) {
        const key = dayKey(move.at);
        if (key !== currentDay) {
            currentDay = key;
            lines.push({ day: move.at, moves: [move] });
        } else {
            lines[lines.length - 1].moves.push(move);
        }
    }
    return lines;
}
