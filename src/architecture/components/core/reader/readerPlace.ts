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
