import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

// Grows across T6–T9 with each action's label/desc/notice (24 keys total when complete).
const KEYS = [
    // shared settings-form keys (T5)
    "research_action_property_name",
    "research_action_property_desc",
    "research_action_zone_name",
    "research_action_zone_desc",
    "research_action_zone_frontmatter",
    "research_action_zone_context",
    "research_action_target_name",
    "research_action_target_desc",
    "research_action_limit_name",
    "research_action_limit_desc",
    "research_action_source_value_name",
    "research_action_source_value_desc",
    // extract-claims (T6)
    "research_extract_claims_label",
    "research_extract_claims_desc",
    "research_extract_claims_notice",
    // compare-claims (T7)
    "research_compare_claims_label",
    "research_compare_claims_desc",
    "research_compare_claims_notice",
];

describe("research action i18n parity (#155, AC-7)", () => {
    it("defines every research key in both en and es, non-empty", () => {
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
