import { describe, it, expect } from "@jest/globals";
import { StepBuilderMapper } from "zettelkasten/mappers/StepBuilderMapper";
import type { StepBuilderInfo, StepSettings } from "zettelkasten";

/**
 * The editor must not quietly drop what it cannot name.
 *
 * `StepBuilderInfo2StepSettings` destructures the fields it knows, so **every** capability added to
 * `StepSettings` has to be added here too — and if it is not, saving a step silently deletes it.
 * That is how the #419 linked note was being lost: the form wrote it, the save forgot it.
 */
const FULL: StepSettings = {
    root: true,
    actions: [{ type: "prompt", id: "a", hasUI: true }],
    label: "Fuente",
    childrenHeader: "Pick one",
    targetFolder: "Sources",
    optional: true,
    phase: "PROCESS",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trigger: { event: "create" } as any,
    wait: { mode: "confirm" },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onCreation: [{ type: "calculate-maturity", id: "m" }] as any,
    satellite: {
        template: "Steps/Permanent.md",
        title: "{{title}} — idea",
        relation: { type: "inspired-by", direction: "satellite-to-main" },
    },
    body: "# {{title}}\n",
};

describe("saving a step keeps everything it was given (#425, #426)", () => {
    it("round-trips every field of a fully configured step", () => {
        const info = {
            ...FULL,
            type: "text",
            contentEl: undefined as unknown as HTMLElement,
        } as StepBuilderInfo;

        expect(StepBuilderMapper.StepBuilderInfo2StepSettings(info)).toEqual(FULL);
    });

    it("omits what was never set, so an unconfigured step stays clean", () => {
        const info = {
            root: false,
            actions: [],
            label: "",
            type: "text",
            contentEl: undefined as unknown as HTMLElement,
        } as StepBuilderInfo;

        const settings = StepBuilderMapper.StepBuilderInfo2StepSettings(info);
        for (const key of ["phase", "trigger", "wait", "onCreation", "satellite", "body"]) {
            expect(key in settings).toBe(false);
        }
    });

    it("names every optional capability, so a new one cannot be forgotten", () => {
        // A capability added to StepSettings without a line in the mapper is dropped on save. This
        // list is the contract; extending StepSettings means extending it here too.
        const carried = Object.keys(
            StepBuilderMapper.StepBuilderInfo2StepSettings({
                ...FULL,
                type: "text",
                contentEl: undefined as unknown as HTMLElement,
            } as StepBuilderInfo)
        ).sort();

        expect(carried).toEqual(
            [
                "actions",
                "body",
                "childrenHeader",
                "label",
                "onCreation",
                "optional",
                "phase",
                "root",
                "satellite",
                "targetFolder",
                "trigger",
                "wait",
            ].sort()
        );
    });
});
