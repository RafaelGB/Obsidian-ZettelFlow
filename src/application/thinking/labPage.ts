/**
 * The window, not the pile (#596, slice 3) — pure.
 *
 * The Lab fills up because it asks nothing of you (#469). Time is the honest default order — newest
 * first — but a year of thinking is thousands of thoughts, and putting all of them on screen is DOM
 * weight, not compute. So the list shows a **window** of the newest threads and grows as you scroll.
 *
 * The window reorders nothing and, above all, is never a count: the one number it could expose —
 * "how many are left" — is exactly the debt the Lab exists to refuse, so the only thing it says
 * about the rest is the boolean `hasMore`.
 */

/** How many top-level threads one page adds. About DOM weight, not compute — the model is cheap. */
export const LAB_PAGE = 25;

export interface LabWindow<T> {
    /** The threads to render now — the first `shown`, in order. */
    items: T[];
    /** Whether older threads remain below the window. A boolean, never a number (#469). */
    hasMore: boolean;
}

/** The first `shown` of `all`, and whether more remain. Never reorders; a fresh array either way. */
export function windowOf<T>(all: readonly T[], shown: number): LabWindow<T> {
    const count = Math.min(Math.max(shown, 0), all.length);
    return { items: all.slice(0, count), hasMore: count < all.length };
}

/** One page more, never past the end. */
export function grow(shown: number, total: number): number {
    return Math.min(shown + LAB_PAGE, total);
}

/**
 * Enough of the window shown to include `index` — for a jump to a day far down the list. Never
 * fewer than are already shown, so a jump upward does not throw away what you had open.
 */
export function ensureIndexShown(shown: number, index: number): number {
    return Math.max(shown, index + 1);
}
