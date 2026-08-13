import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

const KEYS = [
    // chrome (6)
    "home_view_title",
    "command_show_home",
    "home_indexing",
    "home_empty",
    "home_error",
    "home_refresh_button",
    // greeting (2)
    "home_greeting",
    "home_thinking_days",
    // sections (5)
    "home_section_new_ideas",
    "home_section_main_concepts",
    "home_section_review_due",
    "home_section_suggested_connections",
    "home_section_next_session",
    // content (3)
    "home_next_session_continue",
    "home_next_session_reason_develop_hub",
    "home_section_empty",
    // toolkit (2)
    "settings_toolkit_home_name",
    "settings_toolkit_home_desc",
];

describe("home i18n parity (#172)", () => {
    it("defines all 18 keys in both en and es, non-empty", () => {
        expect(KEYS.length).toBe(18);
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
