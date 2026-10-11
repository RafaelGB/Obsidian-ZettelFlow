/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, afterEach } from "@jest/globals";
import { DomNode } from "../../../../support/dashboardDom";
import { recordAnimations, reducedMotion, type AnimationRecord } from "../../../../support/motionDom";
import { planCrystallization } from "application/thinking/crystallize";
import type { Thought } from "application/thinking/thought";
import { CrystallizeModal } from "architecture/components/core/lab/CrystallizeModal";
import { MOTION } from "architecture/components/core/reader/readerMotion";

const passage: Thought = {
    id: "h1",
    at: 1,
    text: "",
    links: [],
    about: "Books/Middlemarch.epub",
    quote: { exact: "Who can quite say what she wanted?", prefix: "", suffix: "" },
    locator: { at: 2, label: "Prelude" },
};

let rec: AnimationRecord | null = null;
let undo: (() => void) | null = null;
afterEach(() => {
    rec?.stop();
    rec = null;
    undo?.();
    undo = null;
});

function open(origin?: { left: number; top: number; width: number; height: number }) {
    const app = { vault: { getAbstractFileByPath: () => null } };
    const modal = new CrystallizeModal(app as never, planCrystallization([passage])!, () => undefined, passage.about, origin);
    const content = new DomNode();
    const modalEl = new DomNode();
    (modalEl as any).getBoundingClientRect = () => ({ left: 300, top: 100, width: 500, height: 400 });
    (modal as unknown as { contentEl: DomNode; modalEl: DomNode }).contentEl = content;
    (modal as unknown as { modalEl: DomNode }).modalEl = modalEl;
    modal.onOpen();
    return { modal, modalEl };
}

describe("the preview grows from the row it was asked from (#755 FR-13)", () => {
    it("with an origin: its transform origin at the row, and scale 0.96 → 1 with a fade, fast", () => {
        rec = recordAnimations();
        const { modalEl } = open({ left: 100, top: 300, width: 400, height: 60 });
        expect(modalEl.cssProps["--zf-origin-x"]).toBe("0px");
        expect(modalEl.cssProps["--zf-origin-y"]).toBe("230px");
        expect(modalEl.hasClass("zettelkasten-flow__crystallize-grown")).toBe(true);
        const grow = rec.animations.filter((a) => a.target === modalEl);
        expect(grow).toHaveLength(1);
        expect(grow[0].keyframes).toEqual([
            { opacity: 0, transform: "scale(0.96)" },
            { opacity: 1, transform: "scale(1)" },
        ]);
        expect(grow[0].options.duration).toBe(MOTION.fast);
    });

    it("grows once: drawn again for another destination, it does not grow again", () => {
        rec = recordAnimations();
        const { modal, modalEl } = open({ left: 100, top: 300, width: 400, height: 60 });
        modal.onOpen();
        expect(rec.animations.filter((a) => a.target === modalEl)).toHaveLength(1);
    });

    it("without an origin, nothing changes from today", () => {
        rec = recordAnimations();
        const { modalEl } = open();
        expect(modalEl.cssProps).toEqual({});
        expect(modalEl.hasClass("zettelkasten-flow__crystallize-grown")).toBe(false);
        expect(rec.animations).toHaveLength(0);
    });

    it("under reduced motion it is simply there", () => {
        rec = recordAnimations();
        undo = reducedMotion(true);
        open({ left: 100, top: 300, width: 400, height: 60 });
        expect(rec.animations).toHaveLength(0);
    });
});
