import { describe, it, expect } from "@jest/globals";
import { DomNode } from "../../../../support/dashboardDom";
import {
    EDGE_BACK_SWIPE,
    SYSTEM_EDGE_PX,
    classify,
    completionRate,
    edgeZone,
    isThing,
    releaseTurn,
    rubberBand,
    startGesture,
} from "architecture/components/core/reader/readerGestures";

const at = (x: number, y: number, t: number) => ({ x, y, t });
const down = (x: number, y: number, pointerType = "touch") => ({ pointerType, clientX: x, clientY: y, timeStamp: 0 });

/** One touch on the page (#750 FR-1–FR-4, AC-1): a tap, a swipe, a scroll or a long press. */
describe("a touch on the page is one gesture (#750)", () => {
    it("is told from its distance, its time and its direction", () => {
        const start = at(500, 500, 0);
        expect(classify(start, at(505, 500, 120), true)).toBe("tap");
        expect(classify(start, at(460, 508, 160), false)).toBe("swipe");
        expect(classify(start, at(508, 540, 160), false)).toBe("scroll");
        expect(classify(start, at(503, 500, 600), true)).toBe("press");
        expect(classify(start, at(503, 500, 600), false)).toBe("press");
        // Still inside the slop and still down: nothing decided yet.
        expect(classify(start, at(504, 504, 100), false)).toBe("pending");
        // Lifted too slowly to be a tap, too soon to be a press: nothing at all.
        expect(classify(start, at(502, 500, 400), true)).toBe("none");
    });

    it("decides once, and a diagonal stays a scroll however it ends (FR-4)", () => {
        const gesture = startGesture(down(500, 500), 1000)!;
        expect(gesture.update(at(530, 528, 80))).toBe("scroll");
        expect(gesture.update(at(700, 530, 160))).toBe("scroll");
        expect(gesture.end(at(760, 530, 200))).toBe("scroll");
        const swipe = startGesture(down(500, 500), 1000)!;
        expect(swipe.update(at(470, 505, 60))).toBe("swipe");
        expect(swipe.update(at(470, 700, 120))).toBe("swipe");
    });

    it("measures how far and how fast the finger went", () => {
        const gesture = startGesture(down(500, 500), 1000)!;
        gesture.update(at(480, 500, 20));
        gesture.update(at(440, 500, 40));
        gesture.update(at(400, 500, 60));
        expect(gesture.dx).toBe(-100);
        expect(gesture.vx).toBeCloseTo(-2, 1);
    });

    it("never takes a mouse or a trackpad, nor a touch at the very edge of the screen (FR-1, FR-3)", () => {
        expect(startGesture(down(500, 500, "mouse"), 1000)).toBeNull();
        expect(startGesture(down(SYSTEM_EDGE_PX - 10, 500), 1000)).toBeNull();
        expect(startGesture(down(1000 - SYSTEM_EDGE_PX + 5, 500), 1000)).toBeNull();
        expect(startGesture(down(SYSTEM_EDGE_PX + 5, 500), 1000)).not.toBeNull();
        expect(startGesture(down(500, 500, "pen"), 1000)).not.toBeNull();
        // The trail's back-swipe from that strip (#761 FR-10) waits for the device walk's P8b.
        expect(EDGE_BACK_SWIPE).toBe(false);
    });

    it("splits the stage into the back edge, the middle and the forward edge: the outer fifth each", () => {
        const stage = { left: 0, width: 1000 };
        expect(edgeZone(190, stage)).toBe("back");
        expect(edgeZone(210, stage)).toBe("middle");
        expect(edgeZone(790, stage)).toBe("middle");
        expect(edgeZone(810, stage)).toBe("forward");
        expect(edgeZone(110, { left: 100, width: 1000 })).toBe("back");
    });

    it("leaves a tap on something to that thing (FR-2)", () => {
        const page = new DomNode("article");
        const p = page.createEl("p");
        const link = p.createEl("a");
        const sup = p.createEl("sup").createSpan();
        const mark = p.createEl("mark", { cls: "zettelkasten-flow__reader-highlight" });
        const button = page.createEl("button").createSpan();
        const pop = page.createDiv({ cls: "zettelkasten-flow__reader-hl-pop" }).createSpan();
        const note = page.createDiv({ cls: "zettelkasten-flow__reader-note-pop" }).createSpan();
        const sheet = page.createDiv({ cls: "zettelkasten-flow__reader-panel" }).createSpan();
        for (const thing of [link, sup, mark, button, pop, note, sheet]) expect(isThing(thing as never, false)).toBe(true);
        expect(isThing(p as never, false)).toBe(false);
        expect(isThing(p as never, true)).toBe(true);
        expect(isThing(null, false)).toBe(false);
    });

    it("completes a released turn past a third, or on a flick its way; springs back otherwise (AC-3)", () => {
        const width = 1000;
        expect(releaseTurn({ dx: -340, width, vx: -0.1 })).toBe("complete");
        expect(releaseTurn({ dx: -200, width, vx: -0.6 })).toBe("complete");
        expect(releaseTurn({ dx: -200, width, vx: 0.6 })).toBe("spring");
        expect(releaseTurn({ dx: -300, width, vx: -0.1 })).toBe("spring");
        expect(releaseTurn({ dx: 340, width, vx: 0.1 })).toBe("complete");
        expect(releaseTurn({ dx: -400, width, vx: 0.8 })).toBe("spring");
    });

    it("resists at the ends of the book, a third of the finger (FR-18)", () => {
        expect(rubberBand(90)).toBe(30);
        expect(rubberBand(-90)).toBe(-30);
    });

    it("finishes a turn at the speed it was let go, never slower than its own pace nor three times it (FR-17)", () => {
        expect(completionRate(0.5, 0.1, 1000, 650)).toBe(1);
        expect(completionRate(0.5, -2, 1000, 650)).toBeCloseTo(1.3, 5);
        expect(completionRate(0.5, 9, 1000, 650)).toBe(3);
    });
});
