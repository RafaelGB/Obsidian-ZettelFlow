import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { DomNode, installBrowserGlobals } from "../../../../support/dashboardDom";
import { recordAnimations, reducedMotion, type AnimationRecord } from "../../../../support/motionDom";
import { reconcile, FLIP_KEY_ATTR, FLIP_STAGGER_MS, FLIP_MAX_STAGGER } from "architecture/components/core/reader/readerFlip";
import { MOTION } from "architecture/components/core/reader/readerMotion";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A list host whose children lay out top to bottom, 40 px each — so a reorder moves them. */
function host(): DomNode {
    const el = new DomNode("div");
    (el as any).getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 400 });
    return el;
}

/** A row's box: 40 px tall, in the order of the rows still in the flow — the layout a browser would do. */
function rowBox(this: DomNode) {
    const flow = (this.parent?.children ?? []).filter((child) => !child.hasClass("zettelkasten-flow__reader-flip-leaving"));
    const at = flow.indexOf(this);
    return { left: 0, top: Math.max(0, at) * 40, width: 300, height: 40 };
}

function make(list: DomNode) {
    return (key: string) => {
        const el = list.createDiv({ cls: "row", text: key });
        (el as any).getBoundingClientRect = rowBox;
        return el as unknown as HTMLElement;
    };
}

const keysOf = (list: DomNode) => list.children.filter((child) => !child.hasClass("zettelkasten-flow__reader-flip-leaving")).map((child) => child.getAttribute(FLIP_KEY_ATTR));

describe("a keyed list that moves instead of redrawing (#754 FR-18–FR-20, FR-22)", () => {
    let record: AnimationRecord;
    let undoMotion: () => void;
    beforeEach(() => {
        installBrowserGlobals();
        record = recordAnimations();
        undoMotion = reducedMotion(false);
    });
    afterEach(() => {
        record.stop();
        undoMotion();
    });

    it("keeps the element of an item that stays, and slides it to its new place by transform", () => {
        const list = host();
        reconcile(list as never, ["a", "b", "c"], make(list));
        const b = list.children[1];
        record.animations.length = 0;
        reconcile(list as never, ["b", "c"], make(list));
        expect(list.children.includes(b)).toBe(true);
        expect(keysOf(list)).toEqual(["b", "c"]);
        const moved = record.animations.find((animation) => animation.target === b);
        expect(moved?.keyframes[0].transform).toBe("translate(0px, 40px)");
        expect(moved?.options.duration).toBe(MOTION.base);
    });

    it("lets a leaving item fade and drop 4 px, out of the flow, then removes it", () => {
        const list = host();
        reconcile(list as never, ["a", "b"], make(list));
        record.animations.length = 0;
        const a = list.children[0];
        reconcile(list as never, ["b"], make(list));
        expect(a.hasClass("zettelkasten-flow__reader-flip-leaving")).toBe(true);
        expect(a.cssProps["--zf-flip-top"]).toBe("0px");
        // Out of the accessibility tree and out of the keyboard's reach while it goes.
        expect(a.getAttribute("aria-hidden")).toBe("true");
        expect(a.getAttribute("inert")).toBe("");
        const leave = record.animations.find((animation) => animation.target === a);
        expect(leave?.keyframes).toEqual([
            { opacity: 1, transform: "translate(0px, 0px)" },
            { opacity: 0, transform: "translate(0px, 4px)" },
        ]);
        expect(leave?.options.duration).toBe(MOTION.fast);
        leave?.finish();
        expect(list.children.includes(a)).toBe(false);
    });

    it("sets a card aside sideways, 16 px, when you rule it out — and brings it back the same way", () => {
        const list = host();
        reconcile(list as never, ["a", "b"], make(list));
        record.animations.length = 0;
        const a = list.children[0];
        reconcile(list as never, ["b"], make(list), { leave: "aside" });
        expect(record.animations.find((animation) => animation.target === a)?.keyframes[1]).toEqual({ opacity: 0, transform: "translate(16px, 0px)" });
        record.finishAll();
        record.animations.length = 0;
        reconcile(list as never, ["a", "b"], make(list), { arrive: "aside" });
        const back = record.animations.find((animation) => animation.target.getAttribute(FLIP_KEY_ATTR) === "a");
        expect(back?.keyframes[0]).toEqual({ opacity: 0, transform: "translate(16px, 0px)" });
    });

    it("lets arrivals fade and rise 4 px, 20 ms apart, six at most, all done within the base beat", () => {
        const list = host();
        record.animations.length = 0;
        reconcile(list as never, ["a", "b", "c", "d", "e", "f", "g", "h"], make(list));
        const arrivals = record.animations;
        expect(arrivals).toHaveLength(8);
        expect(arrivals[0].keyframes[0]).toEqual({ opacity: 0, transform: "translate(0px, 4px)" });
        const delays = arrivals.map((animation) => (animation.options as any).delay ?? 0);
        expect(delays).toEqual([0, 20, 40, 60, 80, 100, 100, 100]);
        expect(FLIP_STAGGER_MS).toBe(20);
        expect(FLIP_MAX_STAGGER).toBe(6);
        for (const animation of arrivals) expect(((animation.options as any).delay ?? 0) + animation.duration).toBeLessThanOrEqual(MOTION.base);
    });

    it("lets arrivals rise over leavers a moment after they start to go, still within the base beat", () => {
        const list = host();
        reconcile(list as never, ["a", "b"], make(list));
        record.animations.length = 0;
        reconcile(list as never, ["c", "d", "e", "f", "g", "h", "i"], make(list));
        const arrivals = record.animations.filter((animation) => (animation.keyframes[0] as any).opacity === 0);
        expect(arrivals.map((animation) => (animation.options as any).delay)).toEqual([30, 50, 70, 90, 110, 130, 130]);
        for (const animation of arrivals) expect((animation.options as any).delay + animation.duration).toBeLessThanOrEqual(MOTION.base);
    });

    it("moves only transform and opacity, and never height", () => {
        const list = host();
        reconcile(list as never, ["a", "b", "c"], make(list));
        reconcile(list as never, ["c", "a", "x"], make(list));
        for (const key of record.keys()) expect(["transform", "opacity"]).toContain(key);
    });

    it("jumps to the end when asked — input during a move", () => {
        const list = host();
        reconcile(list as never, ["a", "b"], make(list));
        const moving = reconcile(list as never, ["b"], make(list));
        moving.finish();
        expect(record.animations.every((animation) => animation.playState === "finished")).toBe(true);
        expect(list.children.map((child) => child.getAttribute(FLIP_KEY_ATTR))).toEqual(["b"]);
    });

    it("under reduced motion changes at once, to the same end", () => {
        undoMotion();
        undoMotion = reducedMotion(true);
        const list = host();
        reconcile(list as never, ["a", "b", "c"], make(list));
        reconcile(list as never, ["c", "a"], make(list), { leave: "aside" });
        expect(record.animations).toHaveLength(0);
        expect(list.children.map((child) => child.getAttribute(FLIP_KEY_ATTR))).toEqual(["c", "a"]);
    });
});
