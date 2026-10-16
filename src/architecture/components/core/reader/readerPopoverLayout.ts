import { LOOKUP_MAX_WORDS, wordCount } from "application/library/stardict/lookup";

/**
 * **A popover that fits the selection** (#811, epic #807) — the pure half. What the popover's second
 * row offers is chosen only by how much was selected, never by what was pressed before, so the same
 * words always give the same row and a hand can learn where things are. Where it opens, and how the
 * arrow keys walk it, are decided here too; the view only measures and draws.
 */

/** Past this many words, a selection is no longer a word to look up (the same count *Look up* uses). */
export const POPOVER_WORDS_MAX = LOOKUP_MAX_WORDS;
/** Past this many words, a selection is a passage, however few sentences it has. */
export const POPOVER_SENTENCE_MAX_WORDS = 40;
/** What ends a sentence — `¿` and `¡` open one and are not here. */
export const SENTENCE_TERMINATORS = ".!?…;。！？；";
/** What may close a sentence after its end: quotes and brackets. */
const CLOSERS = "\"'”’»)]）」』";

export type SelectionSize = "words" | "sentence" | "passage";

/** An action the popover can offer for a passage, besides the meanings, *Note*, *Copy* and *More*. */
export type PopoverAction = "claim" | "link" | "cite" | "look-up" | "translate" | "read-aloud";

/** The second row of each size, in its order (FR-4). */
export const SECOND_ROW: Record<SelectionSize, readonly PopoverAction[]> = {
    words: ["look-up", "translate", "link"],
    sentence: ["claim", "link", "cite"],
    passage: ["cite", "read-aloud", "claim"],
};

/** More's one order (FR-7); the *Think* group always follows it. */
export const MORE_ORDER: readonly PopoverAction[] = ["claim", "link", "cite", "look-up", "translate", "read-aloud"];

/** Whether `text` ends a sentence anywhere but at its very end (closing quotes and brackets allowed). */
function endsInside(text: string): boolean {
    let end = text.length;
    while (end > 0 && (CLOSERS.includes(text[end - 1]) || /\s/.test(text[end - 1]))) end--;
    while (end > 0 && SENTENCE_TERMINATORS.includes(text[end - 1])) end--;
    for (let i = 0; i < end; i++) if (SENTENCE_TERMINATORS.includes(text[i])) return true;
    return false;
}

/**
 * How much was selected (D3): one to three words; up to forty words that make one sentence; or a
 * passage. An abbreviation mid-text (`e.g.`) reads as two sentences — a known, accepted cost.
 */
export function selectionSize(text: string, language?: string): SelectionSize {
    const flat = text.trim();
    if (endsInside(flat)) return "passage";
    const n = wordCount(flat, language);
    if (n <= POPOVER_WORDS_MAX) return "words";
    return n <= POPOVER_SENTENCE_MAX_WORDS ? "sentence" : "passage";
}

/** The second row (FR-4, FR-5): this size's actions that are available, in order — none promoted. */
export function secondRow(size: SelectionSize, available: ReadonlySet<PopoverAction>): PopoverAction[] {
    return SECOND_ROW[size].filter((action) => available.has(action));
}

/** More's list (FR-7): the canonical order, what is available, less what the rows already show. */
export function moreList(order: readonly PopoverAction[], available: ReadonlySet<PopoverAction>, shown: readonly PopoverAction[]): PopoverAction[] {
    return order.filter((action) => available.has(action) && !shown.includes(action));
}

export interface PlaceInput {
    /** The selection's top and bottom on screen. */
    selection: { top: number; bottom: number };
    /** The visible page: from its top to where the Reader's bar begins. */
    room: { top: number; bottom: number };
    /** The popover's collapsed height. */
    height: number;
    /** One line of the chapter: the line above the words is never covered. */
    line: number;
    gap: number;
    touch: boolean;
}

/**
 * Where the popover opens (D4): below, with room for it; else above, a line clear of the words so
 * the line just read stays visible; else below anyway, More scrolling inside it. A finger's popover
 * is always below, beside the system's own callout (FR-15). `y` is the edge that faces the words.
 */
export function placePopover(input: PlaceInput): { side: "below" | "above"; y: number } {
    const { selection, room, height, line, gap, touch } = input;
    const below = { side: "below" as const, y: selection.bottom + gap };
    if (touch || below.y + height <= room.bottom) return below;
    const above = selection.top - line - gap;
    if (above - height >= room.top) return { side: "above", y: above };
    return below;
}

/** Where focus is in the popover: a row (the rows, then More's list) and a place in it. */
export interface FocusAt {
    row: number;
    col: number;
}

/**
 * The arrow keys inside the popover (FR-12): Left and Right along a row, Up and Down between rows
 * (an empty one skipped), keeping the column where the next row has it. Never wraps.
 */
export function nextFocus(rows: readonly number[], at: FocusAt, key: string): FocusAt {
    if (key === "ArrowRight") return { row: at.row, col: Math.min(at.col + 1, Math.max(0, rows[at.row] - 1)) };
    if (key === "ArrowLeft") return { row: at.row, col: Math.max(0, at.col - 1) };
    const step = key === "ArrowDown" ? 1 : key === "ArrowUp" ? -1 : 0;
    if (step === 0) return at;
    for (let row = at.row + step; row >= 0 && row < rows.length; row += step) {
        if (rows[row] > 0) return { row, col: Math.min(at.col, rows[row] - 1) };
    }
    return at;
}
