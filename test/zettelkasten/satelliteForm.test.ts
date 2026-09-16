import { describe, it, expect } from "@jest/globals";
import {
    DEFAULT_SATELLITE,
    satelliteFormState,
    satelliteFromForm,
} from "zettelkasten/modals/handlers/satelliteForm";

const declared = {
    template: "Steps/Permanent.md",
    title: "{{title}} — idea",
    targetFolder: "Ideas",
    relation: { type: "inspired-by", direction: "satellite-to-main" as const },
};

describe("the linked note is authored from a form, never from YAML (#419, §XIII)", () => {
    it("starts off, with defaults that already work", () => {
        const state = satelliteFormState(undefined);
        expect(state.enabled).toBe(false);
        expect(state.title).toBe(DEFAULT_SATELLITE.title);
        expect(state.type).toBe("inspired-by");
        expect(state.direction).toBe("satellite-to-main");
        // Only the template is left for the author: only they know which one it is.
        expect(state.template).toBe("");
        expect(state.error).toBeUndefined();
    });

    it("shows what the step already declares", () => {
        expect(satelliteFormState(declared)).toEqual({
            enabled: true,
            template: "Steps/Permanent.md",
            title: "{{title}} — idea",
            folder: "Ideas",
            type: "inspired-by",
            direction: "satellite-to-main",
        });
    });

    it("round-trips: what the form shows is what the step keeps", () => {
        expect(satelliteFromForm(satelliteFormState(declared))).toEqual(declared);
    });

    it("turning it off clears the declaration", () => {
        const state = { ...satelliteFormState(declared), enabled: false };
        expect(satelliteFromForm(state)).toBeUndefined();
    });

    it("omits the folder when it is blank, so the note inherits the main one's", () => {
        const state = { ...satelliteFormState(declared), folder: "   " };
        expect(satelliteFromForm(state)).not.toHaveProperty("targetFolder");
    });

    it("keeps incomplete work and names the defect instead of dropping it", () => {
        const partial = satelliteFromForm({ ...satelliteFormState(declared), template: "" });
        expect(partial).toBeDefined();
        expect(satelliteFormState(partial).error).toBe("template-missing");
    });

    it("names a relation the vocabulary does not have", () => {
        const odd = satelliteFromForm({ ...satelliteFormState(declared), type: "source" });
        expect(satelliteFormState(odd).error).toBe("relation-invalid");
    });

    it("trims what the author typed, so a stray space is not a path", () => {
        const state = {
            ...satelliteFormState(declared),
            template: "  Steps/Permanent.md  ",
            title: "  {{title}} — idea  ",
        };
        expect(satelliteFromForm(state)).toMatchObject({
            template: "Steps/Permanent.md",
            title: "{{title}} — idea",
        });
    });
});
