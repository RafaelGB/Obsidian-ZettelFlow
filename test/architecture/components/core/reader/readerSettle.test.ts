/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { DomNode } from "../../../../support/dashboardDom";
import { recordAnimations, reducedMotion, type AnimationRecord } from "../../../../support/motionDom";
import { LAYOUT_SETTLE, settleAround, settleFrames } from "architecture/components/core/reader/readerSettle";
import { MOTION } from "architecture/components/core/reader/readerMotion";

describe("the text settles around the line you were reading (#753 FR-14)", () => {
    it("drifts a block in from where it was, never further than the cap, from a faint start", () => {
        expect(settleFrames(140, 100, 8, 0.55)).toEqual([
            { opacity: 0.55, translate: "0px 8px" },
            { opacity: 1, translate: "0px 0px" },
        ]);
        expect(settleFrames(96, 100, 8, 0.85)[0]).toEqual({ opacity: 0.85, translate: "0px -4px" });
        // A block that was not on screen comes from the cap.
        expect(settleFrames(null, 100, 8, 0.55)[0].translate).toBe("0px 8px");
    });

    describe("on the page", () => {
        let rec: AnimationRecord;
        let motion: () => void;
        beforeEach(() => {
            rec = recordAnimations();
            motion = reducedMotion(false);
        });
        afterEach(() => {
            rec.stop();
            motion();
        });

        const blocks = () =>
            Array.from({ length: 4 }, (_, i) => {
                const el = new DomNode("p") as any;
                el.getBoundingClientRect = () => ({ left: 0, top: 100 + i * 50, width: 600, height: 40 });
                return { el, oldTop: 300 + i * 50 };
            });

        it("never moves the anchor, and moves the rest by opacity and translate alone", () => {
            const all = blocks();
            settleAround(all[1].el, all);
            expect(rec.animations).toHaveLength(3);
            expect(rec.animations.map((a) => a.target)).not.toContain(all[1].el);
            expect([...rec.keys()].sort()).toEqual(["opacity", "translate"]);
            expect(rec.animations[0].options).toMatchObject({ duration: LAYOUT_SETTLE.duration, easing: MOTION.ease });
        });

        it("is instant under reduced motion", () => {
            motion();
            motion = reducedMotion(true);
            settleAround(null, blocks());
            expect(rec.animations).toHaveLength(0);
        });
    });
});
