import { describe, it, expect } from "@jest/globals";
import { STEP_PHASES } from "zettelkasten/phases";
import {
    PHASE_CANVAS_COLOR,
    phaseCanvasColor,
    phaseColourLegend,
    stepCanvasColor,
} from "zettelkasten/phases/phaseColor";

describe("colour means the phase (#429)", () => {
    it("gives every phase a canvas colour", () => {
        for (const phase of STEP_PHASES) {
            expect(phaseCanvasColor(phase)).toMatch(/^[1-6]$/);
        }
    });

    it("says nothing for an unphased step", () => {
        expect(phaseCanvasColor(undefined)).toBeUndefined();
    });

    it("keeps the arc in order, one colour per phase up to the closing movement", () => {
        expect(STEP_PHASES.map((phase) => PHASE_CANVAS_COLOR[phase])).toEqual([
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "6",
        ]);
    });

    it("shares the last colour between REVIEW and CONSOLIDATE, as a decision", () => {
        // Seven phases, six canvas presets. Sharing the closing movement is the choice; the legend
        // states it. This test exists so nobody changes it by accident.
        expect(PHASE_CANVAS_COLOR.REVIEW).toBe(PHASE_CANVAS_COLOR.CONSOLIDATE);
        const distinct = new Set(Object.values(PHASE_CANVAS_COLOR));
        expect(distinct.size).toBe(6);
    });
});

describe("the legend states what each colour means (#429)", () => {
    it("has one row per colour, naming every phase that shares it", () => {
        const legend = phaseColourLegend();
        expect(legend).toHaveLength(6);
        expect(legend.at(-1)).toEqual({ color: "6", phases: ["REVIEW", "CONSOLIDATE"] });
    });

    it("covers every phase exactly once", () => {
        const named = phaseColourLegend().flatMap((entry) => entry.phases);
        expect(named.sort()).toEqual([...STEP_PHASES].sort());
    });
});

describe("the same colour on the canvas and in the wizard (#429, AC-4)", () => {
    it("fills the gap for a phased step that was never coloured", () => {
        expect(stepCanvasColor(undefined, "PROCESS")).toBe(PHASE_CANVAS_COLOR.PROCESS);
    });

    it("never overrides a colour someone picked", () => {
        expect(stepCanvasColor("#ff0000", "PROCESS")).toBe("#ff0000");
        expect(stepCanvasColor("2", "PROCESS")).toBe("2");
    });

    it("leaves an unphased, uncoloured step alone", () => {
        expect(stepCanvasColor(undefined, undefined)).toBeUndefined();
    });
});
