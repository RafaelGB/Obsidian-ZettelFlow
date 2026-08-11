import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

const KEYS = [
    "knowledge_action_orphan_label",
    "knowledge_action_orphan_desc",
    "knowledge_action_maturity_label",
    "knowledge_action_maturity_desc",
    "knowledge_action_contradiction_label",
    "knowledge_action_contradiction_desc",
    "knowledge_action_unanswered_label",
    "knowledge_action_unanswered_desc",
    "knowledge_action_property_name",
    "knowledge_action_property_desc",
    "knowledge_action_zone_name",
    "knowledge_action_zone_desc",
    "knowledge_action_zone_frontmatter",
    "knowledge_action_zone_context",
    "knowledge_action_target_name",
    "knowledge_action_target_desc",
    "knowledge_find_contradiction_notice",
    "knowledge_find_unanswered_question_notice",
];

describe("knowledge action i18n parity (#153, AC-8)", () => {
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
