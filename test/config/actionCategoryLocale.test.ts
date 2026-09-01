import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";
import { ACTION_CATEGORIES, CATEGORY_LABEL_KEY } from "architecture/api/categories/categories";

describe("action category i18n parity (#152, AC-6)", () => {
    // Derived from the source vocabulary, not a hand-copied list — which is why this one survives
    // while its ten hand-maintained siblings were retired (#320).
    const keys = ACTION_CATEGORIES.map((category) => CATEGORY_LABEL_KEY[category]);

    it("defines a label for every category in both en and es, non-empty", () => {
        expect(keys.length).toBe(ACTION_CATEGORIES.length);
        const enMap = en as Record<string, string>;
        const esMap = es as Record<string, string>;
        for (const key of keys) {
            expect(typeof enMap[key]).toBe("string");
            expect(enMap[key].length).toBeGreaterThan(0);
            expect(typeof esMap[key]).toBe("string");
            expect(esMap[key].length).toBeGreaterThan(0);
        }
    });
});
