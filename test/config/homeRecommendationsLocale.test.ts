import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";
import { RECOMMENDATION_REASONS } from "architecture/knowledge/state/recommendation";

const KEYS = [
    "home_section_recommendations",
    ...RECOMMENDATION_REASONS.map((r) => `home_recommendation_reason_${r}`),
];

describe("Home recommendation i18n (#273, AC-1/AC-6)", () => {
    it("references the section title + one label per reason (13 keys)", () => {
        expect(KEYS).toHaveLength(13);
    });

    it("defines every key in both en and es, non-empty (sentence case)", () => {
        const e = en as Record<string, string>;
        const s = es as Record<string, string>;
        for (const key of KEYS) {
            expect(typeof e[key]).toBe("string");
            expect(e[key].length).toBeGreaterThan(0);
            expect(typeof s[key]).toBe("string");
            expect(s[key].length).toBeGreaterThan(0);
            expect(e[key]).not.toMatch(/^[A-Z]{2,}/);
        }
    });
});
