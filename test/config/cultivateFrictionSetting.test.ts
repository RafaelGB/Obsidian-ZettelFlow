import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { DEFAULT_SETTINGS } from "config/typing";

// test/config → 2 ups → repo root
const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("the friction toggle (#338, T4)", () => {
    it("is on by default", () => {
        // The manifesto describes friction as what the product *does*, not as an option. Shipping it
        // off by default would ship a principle nobody experiences.
        expect(DEFAULT_SETTINGS.cultivateFriction).toBe(true);
    });

    it("is a single switch, not a per-move matrix", () => {
        const typing = read("src/config/typing.ts");
        expect(typing).toMatch(/cultivateFriction\?:\s*boolean/);
        expect(typing).not.toMatch(/cultivateFrictionMoves/);
    });

    it("lives beside the recipe, in the Cultivate settings group", () => {
        const tab = read("src/config/modals/ZettelFlowSettingsTab.tsx");
        const group = tab.slice(tab.indexOf("settings_cultivate_heading"), tab.indexOf("settings_relations_heading"));
        expect(group).toContain("settings_cultivate_friction_name");
        expect(group).toContain("cultivateFriction");
    });

    it("is what the Cultivate renderer actually reads", () => {
        const renderer = read("src/architecture/components/core/cultivate/CultivateModeRenderer.ts");
        expect(renderer).toMatch(/cultivateFriction/);
        // Undefined must read as on, so an install that predates the setting still gets it.
        expect(renderer).toMatch(/cultivateFriction\s*\?\?\s*true/);
    });
});
