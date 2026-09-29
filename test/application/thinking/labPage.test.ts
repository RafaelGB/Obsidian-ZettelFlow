import { describe, it, expect } from "@jest/globals";
import { LAB_PAGE, windowOf, grow, ensureIndexShown } from "application/thinking/labPage";

/**
 * The window, not the pile (#596, slice 3).
 *
 * A lab that has run for a year is thousands of thoughts, and rendering all of them is DOM weight,
 * not compute. So the list shows a window — the newest threads first — and grows as you scroll.
 * The window is pure and never reorders; the one thing it must never grow into is a **count**.
 */
describe("windowOf — the first shown threads, and whether more remain (#596)", () => {
    const all = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

    it("takes the first `shown`, in the order they came, and reorders nothing", () => {
        expect(windowOf(all, 3)).toEqual({ items: [10, 9, 8], hasMore: true });
    });

    it("says there is no more once the whole list is shown", () => {
        expect(windowOf(all, all.length)).toEqual({ items: all, hasMore: false });
    });

    it("clamps a window larger than the list rather than inventing empties", () => {
        expect(windowOf(all, 99)).toEqual({ items: all, hasMore: false });
    });

    it("shows nothing for a zero or negative window, but still reports what waits", () => {
        expect(windowOf(all, 0)).toEqual({ items: [], hasMore: true });
        expect(windowOf(all, -5)).toEqual({ items: [], hasMore: true });
    });

    it("is empty and finished for an empty list", () => {
        expect(windowOf([], 25)).toEqual({ items: [], hasMore: false });
    });

    it("returns a fresh array, so the caller cannot mutate the source", () => {
        const window = windowOf(all, 2);
        window.items.push(0);
        expect(all).toHaveLength(10);
    });
});

describe("grow — one page more, never past the end (#596)", () => {
    it("adds exactly one page", () => {
        expect(grow(0, 1000)).toBe(LAB_PAGE);
        expect(grow(LAB_PAGE, 1000)).toBe(LAB_PAGE * 2);
    });

    it("never asks for more than there is", () => {
        expect(grow(LAB_PAGE, LAB_PAGE + 3)).toBe(LAB_PAGE + 3);
        expect(grow(40, 40)).toBe(40);
    });
});

describe("ensureIndexShown — enough window to reach a jump target (#596)", () => {
    it("grows the window just far enough to include the index", () => {
        expect(ensureIndexShown(25, 200)).toBe(201);
    });

    it("never shrinks a window already past the target", () => {
        expect(ensureIndexShown(300, 12)).toBe(300);
        expect(ensureIndexShown(25, 24)).toBe(25);
    });
});
