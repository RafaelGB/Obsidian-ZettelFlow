import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

// test/config → 2 ups → repo root
const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const KEYS = [
    "settings_judgements_heading",
    "settings_judgements_intro",
    "settings_judgements_enable_name",
    "settings_judgements_enable_desc",
    "settings_judgements_disclosure",
];

/**
 * `capabilities-and-privacy.md` tells the user the judgement record "can be turned off". A setting the
 * docs promise and the UI does not offer is the same class of defect as the clipboard row corrected in
 * #340 — so the promise is pinned by a test.
 */
describe("the judgement record can actually be turned off (#336)", () => {
    it("ships a settings group with an enable toggle", () => {
        const group = read("src/config/modals/handlers/judgementSettingsGroup.ts");
        expect(group).toContain("plugin.settings.judgements.enabled");
        expect(group).toContain("settings_judgements_enable_name");
    });

    it("is wired into the settings tab beside the other data toggles", () => {
        const tab = read("src/config/modals/ZettelFlowSettingsTab.tsx");
        expect(tab).toContain("judgementSettingsGroup(plugin)");
    });

    it("speaks both languages", () => {
        for (const locale of [en, es] as unknown as Record<string, string>[]) {
            for (const key of KEYS) {
                expect(typeof locale[key]).toBe("string");
                expect(locale[key].length).toBeGreaterThan(0);
            }
        }
    });
});
