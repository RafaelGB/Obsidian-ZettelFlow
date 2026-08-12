import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

const KEYS = [
    "knowledge_debt_heading",
    "knowledge_debt_score",
    "knowledge_debt_clean",
    "knowledge_debt_count",
    "knowledge_debt_unreferenced_label",
    "knowledge_debt_unreferenced_desc",
    "knowledge_debt_dangling_label",
    "knowledge_debt_dangling_desc",
    "knowledge_debt_unsourced_label",
    "knowledge_debt_unsourced_desc",
    "knowledge_debt_open_question_label",
    "knowledge_debt_open_question_desc",
];

describe("knowledge debt i18n parity (#159, AC-3)", () => {
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
