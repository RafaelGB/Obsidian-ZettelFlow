import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

// Grows across T9–T12 with each action's keys and the settings keys.
const KEYS = [
    // shared settings-form keys
    "ai_action_property_name",
    "ai_action_property_desc",
    "ai_action_zone_name",
    "ai_action_zone_desc",
    "ai_action_zone_frontmatter",
    "ai_action_zone_context",
    // gate notices
    "ai_disabled_notice",
    "ai_not_configured_notice",
    "ai_request_failed_notice",
    // summarize (T9)
    "ai_summarize_label",
    "ai_summarize_desc",
    "ai_summarize_notice",
    // classify (T10)
    "ai_classify_label",
    "ai_classify_desc",
    "ai_classify_notice",
    // generate-questions (T11)
    "ai_generate_questions_label",
    "ai_generate_questions_desc",
    "ai_generate_questions_notice",
];

describe("ai action i18n parity (#156, AC-5)", () => {
    it("defines every AI key in both en and es, non-empty", () => {
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
