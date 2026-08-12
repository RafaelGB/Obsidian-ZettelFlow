import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

const KEYS = [
    "weekly_review_command_name",
    "weekly_review_note_title",
    "weekly_review_clean",
    "weekly_review_section_created",
    "weekly_review_section_orphans",
    "weekly_review_section_forgotten",
    "weekly_review_section_important",
    "weekly_review_action_open",
    "weekly_review_action_connect",
    "weekly_review_action_review",
    "weekly_review_not_ready",
    "weekly_review_error",
];

describe("weekly review i18n parity (#160, FR-11)", () => {
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
