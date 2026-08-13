import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

// One `<id>_purpose` key per registered action (#187) — the picker-card description, i18n'd.
const KEYS = [
    "prompt_purpose",
    "number_purpose",
    "checkbox_purpose",
    "selector_purpose",
    "dynamic_selector_purpose",
    "calendar_purpose",
    "backlink_purpose",
    "tags_purpose",
    "cssclasses_purpose",
    "script_purpose",
    "task_management_purpose",
    "zettel_id_purpose",
    "detect_orphan_purpose",
    "calculate_maturity_purpose",
    "find_contradiction_purpose",
    "find_unanswered_question_purpose",
    "suggest_next_move_purpose",
    "thinking_simulator_purpose",
    "find_related_purpose",
    "suggest_link_purpose",
    "create_semantic_relation_purpose",
    "extract_claims_purpose",
    "compare_claims_purpose",
    "find_sources_purpose",
    "attach_source_purpose",
    "summarize_purpose",
    "classify_purpose",
    "generate_questions_purpose",
];

describe("action purpose i18n parity (#187)", () => {
    it("defines all 28 purpose keys in both en and es, non-empty", () => {
        expect(KEYS.length).toBe(28);
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
