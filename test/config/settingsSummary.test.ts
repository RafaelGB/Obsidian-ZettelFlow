import { describe, it, expect } from "@jest/globals";
import { settingsSummary } from "config/settingsSummary";

describe("the panel says what is on right now (#440)", () => {
    it("reads a default install as quiet", () => {
        expect(settingsSummary({})).toEqual([
            { labelKey: "settings_summary_create", valueKey: "settings_summary_none" },
            { labelKey: "settings_summary_ai", valueKey: "settings_summary_off" },
            { labelKey: "settings_summary_friction", valueKey: "settings_summary_on" },
            { labelKey: "settings_summary_hooks", valueKey: "settings_summary_none" },
            { labelKey: "settings_summary_logging", valueKey: "settings_summary_off" },
        ]);
    });

    it("names the canvas you create with, not its path", () => {
        const [create] = settingsSummary({ ribbonCanvas: "_ZettelFlow/flows/Zettel.canvas" });
        expect(create).toEqual({ labelKey: "settings_summary_create", value: "Zettel" });
    });

    it("names the AI provider when AI is on", () => {
        const facts = settingsSummary({ ai: { enabled: true, provider: "openai" } });
        expect(facts[1]).toEqual({ labelKey: "settings_summary_ai", value: "openai" });
    });

    it("reports friction as off only when it was turned off", () => {
        expect(settingsSummary({ cultivateFriction: false })[2].valueKey).toBe("settings_summary_off");
        expect(settingsSummary({ cultivateFriction: true })[2].valueKey).toBe("settings_summary_on");
    });

    it("counts the hooks and reports the level being logged", () => {
        const facts = settingsSummary({
            hooks: { properties: { a: {}, b: {} } },
            logLevel: "debug",
        });
        expect(facts[3]).toEqual({ labelKey: "settings_summary_hooks", value: "2" });
        expect(facts[4]).toEqual({ labelKey: "settings_summary_logging", value: "debug" });
    });
});
