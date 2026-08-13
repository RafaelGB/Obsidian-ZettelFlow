import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

const KEYS = [
    // View + toolkit (T6)
    "evolution_timeline_view_title",
    "command_show_evolution_timeline",
    "evolution_timeline_loading",
    "evolution_timeline_empty",
    "evolution_timeline_disabled",
    "evolution_timeline_error",
    "evolution_timeline_refresh_button",
    "evolution_timeline_state_label",
    "evolution_timeline_claims_label",
    "settings_toolkit_timeline_name",
    "settings_toolkit_timeline_desc",
    // Settings group (T5)
    "settings_timeline_heading",
    "settings_timeline_intro",
    "settings_timeline_enable_name",
    "settings_timeline_enable_desc",
    "settings_timeline_disclosure",
];

describe("evolution timeline i18n parity (#168)", () => {
    it("defines all 16 keys in both en and es, non-empty", () => {
        expect(KEYS.length).toBe(16);
        const enMap = en as Record<string, string>;
        const esMap = es as Record<string, string>;
        for (const key of KEYS) {
            expect(typeof enMap[key]).toBe("string");
            expect(enMap[key].length).toBeGreaterThan(0);
            expect(typeof esMap[key]).toBe("string");
            expect(esMap[key].length).toBeGreaterThan(0);
        }
    });
});
