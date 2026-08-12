import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

const KEYS = [
    "knowledge_balance_heading",
    "knowledge_balance_reference_label",
    "knowledge_balance_question_label",
    "knowledge_balance_example_label",
    "knowledge_balance_conclusion_label",
    "knowledge_balance_concept_label",
    "knowledge_balance_suggest_add_sources",
    "knowledge_balance_suggest_add_examples",
    "knowledge_balance_suggest_ask_questions",
    "knowledge_balance_balanced",
];

describe("knowledge balance i18n parity (#161)", () => {
    it("defines all 10 keys in both en and es, non-empty", () => {
        expect(KEYS.length).toBe(10);
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
