import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

const KEYS = [
    "discoveries_view_title",
    "command_show_discoveries",
    "discoveries_computing",
    "discoveries_none",
    "discoveries_error",
    "discoveries_refresh_button",
    "discoveries_prompt",
    "discoveries_accept",
    "discoveries_dismiss",
    "discoveries_open",
    "discoveries_accepted_notice",
    "discoveries_accept_error_notice",
    "settings_toolkit_discoveries_name",
    "settings_toolkit_discoveries_desc",
];

describe("discoveries i18n parity (#163)", () => {
    it("defines all 14 keys in both en and es, non-empty", () => {
        expect(KEYS.length).toBe(14);
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
