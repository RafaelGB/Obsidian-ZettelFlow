import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

const KEYS = [
    "concept_nav_view_title",
    "command_show_concept_nav",
    "concept_nav_indexing",
    "concept_nav_empty",
    "concept_nav_error",
    "concept_nav_refresh_button",
    "concept_nav_entry_heading",
    "concept_nav_out_heading",
    "concept_nav_in_heading",
    "concept_nav_back_button",
    "settings_toolkit_concept_nav_name",
    "settings_toolkit_concept_nav_desc",
];

describe("concept navigation i18n parity (#166)", () => {
    it("defines all 12 keys in both en and es, non-empty", () => {
        expect(KEYS.length).toBe(12);
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
