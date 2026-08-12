import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

const KEYS = [
    // action labels + descriptions
    "relation_find_related_label",
    "relation_find_related_desc",
    "relation_suggest_link_label",
    "relation_suggest_link_desc",
    "relation_create_relation_label",
    "relation_create_relation_desc",
    // ranking settings form
    "relation_action_property_name",
    "relation_action_property_desc",
    "relation_action_zone_name",
    "relation_action_zone_desc",
    "relation_action_zone_frontmatter",
    "relation_action_zone_context",
    "relation_action_source_name",
    "relation_action_source_desc",
    "relation_action_limit_name",
    "relation_action_limit_desc",
    // create settings form
    "relation_action_type_name",
    "relation_action_type_desc",
    "relation_action_target_name",
    "relation_action_target_desc",
    // relation-type option labels (#147 vocabulary)
    "relation_type_supports",
    "relation_type_contradicts",
    "relation_type_expands",
    "relation_type_inspired_by",
    "relation_type_question",
    "relation_type_example",
    "relation_type_implements",
    // notices
    "relation_find_related_notice",
    "relation_suggest_link_notice",
    "relation_create_relation_notice",
];

describe("relation action i18n parity (#154, AC-6)", () => {
    it("defines all 30 keys in both en and es, non-empty", () => {
        expect(KEYS.length).toBe(30);
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
