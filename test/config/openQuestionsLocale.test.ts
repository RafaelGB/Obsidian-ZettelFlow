import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

const KEYS = [
    "open_questions_view_title",
    "command_show_open_questions",
    "open_questions_indexing",
    "open_questions_empty",
    "open_questions_error",
    "open_questions_refresh_button",
    "open_questions_asked_by",
    "open_questions_proposed_answers",
    "open_questions_no_answer",
    "settings_toolkit_open_questions_name",
    "settings_toolkit_open_questions_desc",
];

describe("open questions i18n parity (#167)", () => {
    it("defines all 11 keys in both en and es, non-empty", () => {
        expect(KEYS.length).toBe(11);
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
