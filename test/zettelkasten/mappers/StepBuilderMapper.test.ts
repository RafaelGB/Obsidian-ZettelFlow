import { describe, it, expect } from "@jest/globals";
import { StepBuilderMapper } from "zettelkasten/mappers/StepBuilderMapper";
import { mergePhaseIntoFrontmatter } from "zettelkasten/phases";
import type { StepBuilderInfo, StepSettings } from "zettelkasten/typing";

function info(overrides: Partial<StepBuilderInfo> = {}): StepBuilderInfo {
    return {
        type: "file",
        contentEl: {} as HTMLElement,
        root: false,
        actions: [],
        label: "A step",
        childrenHeader: "",
        ...overrides,
    };
}

describe("StepBuilderMapper — phase round-trip (#149)", () => {
    it("omits the phase key for an unphased step (AC-1)", () => {
        const settings = StepBuilderMapper.StepBuilderInfo2StepSettings(info());
        expect("phase" in settings).toBe(false);
        const back = StepBuilderMapper.StepSettings2PartialStepBuilderInfo(settings);
        expect("phase" in back).toBe(false);
    });

    it("preserves a phase token both directions (AC-2)", () => {
        const settings = StepBuilderMapper.StepBuilderInfo2StepSettings(info({ phase: "DEVELOP" }));
        expect(settings.phase).toBe("DEVELOP");
        const back = StepBuilderMapper.StepSettings2PartialStepBuilderInfo(settings);
        expect(back.phase).toBe("DEVELOP");
    });

    it("two steps differing only by phase have deep-equal non-phase projections (AC-8)", () => {
        const withPhase = StepBuilderMapper.StepBuilderInfo2StepSettings(info({ phase: "CAPTURE" }));
        const without = StepBuilderMapper.StepBuilderInfo2StepSettings(info());
        const strip = (s: StepSettings) => {
            const { phase, ...rest } = s;
            void phase;
            return rest;
        };
        expect(strip(withPhase)).toEqual(strip(without));
    });
});

describe("StepBuilderMapper — trigger round-trip (#150, back-compat)", () => {
    const trigger = { event: "note.created" as const, condition: "return true" };

    it("omits the trigger key for a step without a trigger", () => {
        const settings = StepBuilderMapper.StepBuilderInfo2StepSettings(info());
        expect("trigger" in settings).toBe(false);
        const back = StepBuilderMapper.StepSettings2PartialStepBuilderInfo(settings);
        expect("trigger" in back).toBe(false);
    });

    it("preserves a trigger opaquely both directions (no builder UI, but never dropped)", () => {
        const settings = StepBuilderMapper.StepBuilderInfo2StepSettings(info({ trigger }));
        expect(settings.trigger).toEqual(trigger);
        const back = StepBuilderMapper.StepSettings2PartialStepBuilderInfo(settings);
        expect(back.trigger).toEqual(trigger);
    });

    it("two steps differing only by trigger have deep-equal non-trigger projections", () => {
        const withTrigger = StepBuilderMapper.StepBuilderInfo2StepSettings(info({ trigger }));
        const without = StepBuilderMapper.StepBuilderInfo2StepSettings(info());
        const strip = (s: StepSettings) => {
            const { trigger: t, ...rest } = s;
            void t;
            return rest;
        };
        expect(strip(withTrigger)).toEqual(strip(without));
    });
});

describe("mergePhaseIntoFrontmatter — clear-on-save (#149)", () => {
    it("keeps a phase that the incoming settings carry", () => {
        const merged = mergePhaseIntoFrontmatter({ label: "x" }, { label: "x", phase: "PROCESS" });
        expect(merged.phase).toBe("PROCESS");
    });

    it("DELETES a previously-saved phase when the incoming settings clear it (AC-2 clear)", () => {
        const merged = mergePhaseIntoFrontmatter(
            { label: "x", phase: "CAPTURE" },
            { label: "x" } // no phase key -> cleared
        );
        expect("phase" in merged).toBe(false);
    });
});
