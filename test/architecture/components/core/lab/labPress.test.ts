import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Component } from "obsidian";
import { DomNode } from "../../../../support/dashboardDom";
import { pressToPick } from "architecture/components/core/lab/labPress";
import { LONG_PRESS_MS, SLOP_PX } from "architecture/components/core/reader/readerGestures";

/** A card with a text box and a button in it: what a long press may and may not start from. */
function card(picking = false) {
    const box = new DomNode("div");
    const area = box.createEl("textarea") as unknown as DomNode;
    const quote = box.createDiv() as unknown as DomNode;
    const button = box.createEl("button") as unknown as DomNode;
    const pick = jest.fn();
    let selecting = picking;
    pressToPick(box as never, new Component(), { pick, picking: () => selecting });
    const down = (target: DomNode, pointerType = "touch") => box.fire("pointerdown", { target, pointerType, pointerId: 1, isPrimary: true, clientX: 0, clientY: 0 });
    return { box, area, quote, button, pick, down, select: (on: boolean) => (selecting = on) };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("a long press picks a thought on a touch screen (#868 FR-7)", () => {
    it("picks the card held still for a long press, and swallows the tap it ends with", () => {
        const m = card();
        m.down(m.quote);
        jest.advanceTimersByTime(LONG_PRESS_MS);
        expect(m.pick).toHaveBeenCalledTimes(1);
        const end = m.box.fire("touchend", { target: m.quote });
        expect(end.defaultPrevented).toBe(true);
        const click = m.box.fire("click", { target: m.quote });
        expect(click.defaultPrevented).toBe(true);
        expect(m.pick).toHaveBeenCalledTimes(1);
    });

    it("picks from the text box too, while it is not being edited", () => {
        const m = card();
        m.down(m.area);
        jest.advanceTimersByTime(LONG_PRESS_MS);
        expect(m.pick).toHaveBeenCalledTimes(1);
    });

    it("a move past the slop is a scroll: nothing is picked", () => {
        const m = card();
        m.down(m.quote);
        m.box.fire("pointermove", { pointerId: 1, clientX: 0, clientY: SLOP_PX + 1 });
        jest.advanceTimersByTime(LONG_PRESS_MS);
        expect(m.pick).not.toHaveBeenCalled();
    });

    it("lifted early, it is a tap: nothing is picked outside selection mode", () => {
        const m = card();
        m.down(m.quote);
        m.box.fire("pointerup", { pointerId: 1 });
        jest.advanceTimersByTime(LONG_PRESS_MS);
        m.box.fire("click", { target: m.quote });
        expect(m.pick).not.toHaveBeenCalled();
    });

    it("a mouse keeps the checkbox: no long press", () => {
        const m = card();
        m.down(m.quote, "mouse");
        jest.advanceTimersByTime(LONG_PRESS_MS);
        expect(m.pick).not.toHaveBeenCalled();
    });

    it("while something is picked, a tap on the card toggles it — but not on its text box or buttons", () => {
        const m = card(true);
        m.down(m.quote);
        m.box.fire("pointerup", { pointerId: 1 });
        m.box.fire("click", { target: m.quote });
        expect(m.pick).toHaveBeenCalledTimes(1);
        for (const target of [m.area, m.button]) {
            m.down(target);
            m.box.fire("pointerup", { pointerId: 1 });
            m.box.fire("click", { target });
        }
        expect(m.pick).toHaveBeenCalledTimes(1);
    });
});
