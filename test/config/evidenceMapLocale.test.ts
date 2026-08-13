import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

const KEYS = [
    "evidence_map_view_title",
    "command_show_evidence_map",
    "evidence_map_indexing",
    "evidence_map_no_active_note",
    "evidence_map_empty",
    "evidence_map_error",
    "evidence_map_refresh_button",
    "evidence_map_supports_heading",
    "evidence_map_contradicts_heading",
    "evidence_map_evidence_heading",
    "evidence_map_gaps_heading",
    "evidence_map_unsourced_claims_label",
    "evidence_map_open_questions_label",
    "evidence_map_section_empty",
    "settings_toolkit_evidence_map_name",
    "settings_toolkit_evidence_map_desc",
];

describe("evidence map i18n parity (#169)", () => {
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
