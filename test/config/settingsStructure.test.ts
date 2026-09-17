import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..");
const TAB = readFileSync(join(ROOT, "src", "config", "modals", "ZettelFlowSettingsTab.tsx"), "utf8");
const FLOWS = readFileSync(
    join(ROOT, "src", "config", "modals", "handlers", "flowsSettingsGroup.ts"),
    "utf8"
);

/** The headings the tab renders, in the order it renders them. */
function headings(source: string): string[] {
    return [...source.matchAll(/heading: t\("([^"]+)"\)/g)].map((match) => match[1]);
}

/**
 * The panel is organised by **what you are doing** (#440, epic #434), not by when each feature was
 * written. The order is part of the answer: your flows first, the advanced folder paths last, and
 * nothing in between that a first-time reader has to skip.
 */
describe("the settings panel reads as a sequence of questions (#440)", () => {
    it("renders the groups in the order the epic decided", () => {
        expect(headings(TAB)).toEqual([
            "settings_get_started_title",
            "settings_group_creating",
            "settings_group_vocabulary",
            "settings_group_thinking",
            "settings_group_automation",
            "settings_group_advanced",
            "settings_group_about",
        ]);
    });

    it("opens on your flows, which the group module heads", () => {
        // The first group comes from `flowsSettingsGroup`, so it heads the list from there.
        expect(TAB.indexOf("flowsSettingsGroup(plugin")).toBeLessThan(TAB.indexOf("settings_group_creating"));
        expect(headings(FLOWS)).toEqual(["settings_flows_heading"]);
    });

    it("folds the advanced group behind an explicit toggle", () => {
        const advanced = TAB.slice(TAB.indexOf("settings_group_advanced"));
        expect(advanced).toContain("visible: () => this.showAdvanced");
        expect(TAB).toContain("settings_advanced_toggle");
    });

    it("states what is on before asking anything", () => {
        expect(TAB.indexOf("settingsSummary(plugin.settings)")).toBeLessThan(
            TAB.indexOf("flowsSettingsGroup(plugin")
        );
    });
});
