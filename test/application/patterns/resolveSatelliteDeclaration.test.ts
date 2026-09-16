import { describe, it, expect } from "@jest/globals";
import { resolveSatelliteDeclaration } from "application/patterns/resolveSatelliteDeclaration";
import { YamlService } from "architecture/plugin/services/YamlService";
import type { StepSettings } from "zettelkasten";

const declared = {
    template: "steps/permanent.md",
    title: "{{title}} — idea",
    relation: { type: "inspired-by", direction: "satellite-to-main" },
};

function settings(extra: Partial<StepSettings> = {}): StepSettings {
    return { root: false, actions: [], label: "Fuente", ...extra } as StepSettings;
}

describe("a step carries its satellite declaration (#419, FR-13)", () => {
    it("hands over what the step declared", () => {
        expect(resolveSatelliteDeclaration(settings({ satellite: declared }))).toEqual(declared);
    });

    it("yields nothing for a step that declares none — the common case", () => {
        expect(resolveSatelliteDeclaration(settings())).toBeUndefined();
    });

    it("never mutates the settings it reads", () => {
        const input = settings({ satellite: declared });
        const snapshot = JSON.stringify(input);
        resolveSatelliteDeclaration(input);
        expect(JSON.stringify(input)).toBe(snapshot);
    });

    it("survives a YAML round trip, like wait and onCreation do", () => {
        const yaml = [
            "root: false",
            "label: Fuente",
            "actions: []",
            "satellite:",
            "  template: steps/permanent.md",
            "  title: '{{title}} — idea'",
            "  relation:",
            "    type: inspired-by",
            "    direction: satellite-to-main",
        ].join("\n");
        const read = YamlService.instance(yaml).getZettelFlowSettings();
        expect(resolveSatelliteDeclaration(read)).toEqual(declared);
    });

    it("leaves an unknown shape alone rather than guessing", () => {
        // A hand-authored declaration can be anything; validation is satellitePlan's job, and the
        // reader must not silently repair or drop it.
        const odd = { template: 7 } as unknown as StepSettings["satellite"];
        expect(resolveSatelliteDeclaration(settings({ satellite: odd }))).toBe(odd);
    });
});
