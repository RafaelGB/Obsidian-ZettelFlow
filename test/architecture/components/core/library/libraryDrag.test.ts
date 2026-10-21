/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest } from "@jest/globals";
import { Component } from "obsidian";
import { DomNode } from "../../../../support/dashboardDom";
import { fakeFrames } from "../../../../support/fakeFrames";
import { EDGE_MAX_STEP_PX, EdgeScroller, draggable, edgeScrollStep, type DragHooks } from "architecture/components/core/library/libraryDrag";
import { LONG_PRESS_MS } from "architecture/components/core/reader/readerGestures";
import type { ShelfItem } from "application/library/shelf";

/** The shelves scrolling to meet a carried book (#865 FR-16, AC-19). */

describe("how far an edge scrolls (AC-19)", () => {
    it("is nothing outside the edge zones", () => {
        expect(edgeScrollStep(400, 0, 800)).toBe(0);
    });
    it("goes down near the bottom and up near the top, faster nearer the edge", () => {
        const near = edgeScrollStep(780, 0, 800);
        const nearer = edgeScrollStep(799, 0, 800);
        expect(near).toBeGreaterThan(0);
        expect(nearer).toBeGreaterThan(near);
        expect(nearer).toBeLessThanOrEqual(EDGE_MAX_STEP_PX);
        expect(edgeScrollStep(5, 0, 800)).toBeLessThan(0);
    });
    it("keeps its zones inside a short scroller", () => {
        expect(edgeScrollStep(50, 0, 100)).toBe(0);
    });
});

function scroller() {
    const frames = fakeFrames();
    const el = { scrollTop: 0, win: frames.win, getBoundingClientRect: () => ({ top: 0, bottom: 800, left: 0, right: 600, width: 600, height: 800 }) };
    return { el, frames };
}

describe("the frame loop (AC-19)", () => {
    it("scrolls on each frame while the pointer is held at the edge, and stops when it leaves or is let go", () => {
        const { el, frames } = scroller();
        const edge = new EdgeScroller(() => el as any);
        edge.move(795);
        const first = el.scrollTop;
        expect(first).toBeGreaterThan(0);
        frames.frames(3);
        expect(el.scrollTop).toBeGreaterThan(first);
        edge.move(400);
        const held = el.scrollTop;
        frames.frames(3);
        expect(el.scrollTop).toBe(held);
        edge.move(5);
        frames.frames(2);
        expect(el.scrollTop).toBeLessThan(held);
        edge.stop();
        const stopped = el.scrollTop;
        frames.frames(3);
        expect(el.scrollTop).toBe(stopped);
    });
});

describe("a book lifted on a touch screen (FR-16)", () => {
    it("is carried — the cabinet told — and the shelves follow the finger to the edge, until it is let go", () => {
        jest.useFakeTimers();
        try {
            const book = new DomNode();
            const cover = new DomNode();
            const item = { id: "Books/a.epub", kind: "book", file: "Books/a.epub" } as ShelfItem;
            const edge = { move: jest.fn(), stop: jest.fn() };
            const carrying = jest.fn();
            const hooks: DragHooks = { canDrop: () => false, drop: jest.fn(), layer: () => null, bayAt: () => null, edge, carrying };
            const scope = new Component();
            scope.load();
            draggable(book as any, cover as any, item, hooks, scope);
            book.fire("pointerdown", { pointerType: "touch", pointerId: 1, clientX: 10, clientY: 100, isPrimary: true });
            jest.advanceTimersByTime(LONG_PRESS_MS + 10);
            expect(carrying).toHaveBeenLastCalledWith(item);
            book.fire("pointermove", { pointerId: 1, clientX: 10, clientY: 790 });
            expect(edge.move).toHaveBeenLastCalledWith(790);
            book.fire("pointerup", { pointerId: 1, clientX: 10, clientY: 790 });
            expect(edge.stop).toHaveBeenCalled();
            expect(carrying).toHaveBeenLastCalledWith(null);
            expect(hooks.drop).not.toHaveBeenCalled();
        } finally {
            jest.useRealTimers();
        }
    });

    it("on a desktop, follows the drag and stops at its end", () => {
        const book = new DomNode();
        const item = { id: "Books/a.epub", kind: "book", file: "Books/a.epub" } as ShelfItem;
        const edge = { move: jest.fn(), stop: jest.fn() };
        const carrying = jest.fn();
        const scope = new Component();
        scope.load();
        draggable(book as any, new DomNode() as any, item, { canDrop: () => false, drop: jest.fn(), layer: () => null, edge, carrying }, scope);
        book.fire("dragstart", { dataTransfer: { setData: jest.fn(), setDragImage: jest.fn() } });
        expect(carrying).toHaveBeenLastCalledWith(item);
        book.fire("drag", { clientY: 12 });
        expect(edge.move).toHaveBeenLastCalledWith(12);
        // The last drag event of a native drag says 0: it moves nothing.
        book.fire("drag", { clientY: 0 });
        expect(edge.move).toHaveBeenCalledTimes(1);
        book.fire("dragend", {});
        expect(edge.stop).toHaveBeenCalled();
        expect(carrying).toHaveBeenLastCalledWith(null);
    });
});
