import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

const KEYS = [
    "derive_project_command_name",
    "derive_project_title_suffix",
    "derive_project_misc_section",
    "derive_project_not_ready",
    "derive_project_no_active_note",
    "derive_project_empty",
    "derive_project_success",
    "derive_project_error",
];

describe("derive project i18n parity (#173)", () => {
    it("defines all 8 keys in both en and es, non-empty", () => {
        expect(KEYS.length).toBe(8);
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
