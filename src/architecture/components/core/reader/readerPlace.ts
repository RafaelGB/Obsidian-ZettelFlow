/**
 * **A place in the text that survives a reshape** (#750 D3, FR-11): rotating an iPad, a Split View
 * window, a desktop window resized. A place is the first block that crosses the top of the stage and
 * how far into it the top is (0–1) — not a scroll offset, which means another line once the column
 * re-flows. Pure, over plain boxes measured in the stage's scroll coordinates.
 *
 * Reused by deep reading (#764: the line stays while the window goes fullscreen) and by the trail
 * (#761, which adds a text offset on top).
 */

export interface Box {
    /** The block's top, in the scroller's content coordinates (`scrollTop` space). */
    top: number;
    height: number;
}

export interface Place {
    block: number;
    within: number;
}

/** Where `scrollTop` is, as a block and a share of it. */
export function placeAt(blocks: readonly Box[], scrollTop: number): Place {
    if (blocks.length === 0) return { block: 0, within: 0 };
    for (let i = 0; i < blocks.length; i++) {
        const { top, height } = blocks[i];
        if (top + height > scrollTop) {
            const within = height > 0 ? Math.min(1, Math.max(0, (scrollTop - top) / height)) : 0;
            return { block: i, within };
        }
    }
    return { block: blocks.length - 1, within: 1 };
}

/** The scroll that puts `place` back at the top of the stage, over the blocks as they are now. */
export function scrollFor(place: Place, blocks: readonly Box[]): number {
    if (blocks.length === 0) return 0;
    const box = blocks[Math.min(Math.max(0, place.block), blocks.length - 1)];
    return Math.max(0, box.top + place.within * box.height);
}

/**
 * **The reading line** (#751 FR-6): where on the stage the eye reads — a third of the way down. A
 * passage a note goes back to lands there, not at the stage's top edge; a highlight opened from Think
 * too. #754's Alongside reads the same line.
 */
export const READING_LINE = 1 / 3;

/**
 * The block under the reading line (#754 FR-2): the one `line` falls in, else the first below it,
 * else the last. `line` is in the blocks' own coordinates (`scrollTop + clientHeight * READING_LINE`
 * in a scroll). `-1` when there are no blocks.
 */
export function blockAtLine(blocks: readonly Box[], line: number): number {
    if (blocks.length === 0) return -1;
    for (let i = 0; i < blocks.length; i++) {
        const { top, height } = blocks[i];
        if (top + height > line) return i;
    }
    return blocks.length - 1;
}
