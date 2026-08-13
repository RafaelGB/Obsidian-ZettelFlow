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
    // Next-move suggestion (#158)
    "knowledge_action_next_move_label",
    "knowledge_action_next_move_desc",
    "knowledge_next_move_add_source",
    "knowledge_next_move_connect",
    "knowledge_next_move_add_example",
    "knowledge_next_move_advance_state",
    "knowledge_next_move_complete",
    "knowledge_next_move_notice",
    // Thinking simulator (#165)
    "knowledge_action_thinking_label",
    "knowledge_action_thinking_desc",
    "knowledge_thinking_prompt_assume_false",
    "knowledge_thinking_prompt_who_disagrees",
    "knowledge_thinking_prompt_extreme_case",
    "knowledge_thinking_prompt_hidden_assumption",
    "knowledge_thinking_prompt_needs_evidence",
    "knowledge_thinking_prompt_needs_counterpoint",
    "knowledge_thinking_prompt_needs_example",
    "knowledge_thinking_prompt_needs_connection",
    "knowledge_thinking_prompt_needs_question",
    "knowledge_thinking_notice",
];

describe("knowledge action i18n parity (#153/#158/#165, AC-8)", () => {
    it("defines all 38 keys in both en and es, non-empty", () => {
        expect(KEYS.length).toBe(38);
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
