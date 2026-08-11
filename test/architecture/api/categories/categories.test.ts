import { describe, it, expect } from "@jest/globals";
import {
    ACTION_CATEGORIES,
    isActionCategory,
    CATEGORY_LABEL_KEY,
    CATEGORY_EMOJI,
} from "architecture/api/categories/categories";

describe("action category vocabulary (#152, FR-1/FR-2/AC-4)", () => {
    it("ACTION_CATEGORIES is exactly the five capabilities in canonical order", () => {
        expect([...ACTION_CATEGORIES]).toEqual([
            "manipulation",
            "relations",
            "knowledge",
            "research",
            "ai",
        ]);
    });

    it("isActionCategory accepts the five and rejects junk", () => {
        for (const category of ACTION_CATEGORIES) expect(isActionCategory(category)).toBe(true);
        for (const junk of ["", "misc", "Manipulation", 1, null, undefined, {}]) {
            expect(isActionCategory(junk)).toBe(false);
        }
    });

    it("defines a non-empty label key and an emoji for every category", () => {
        for (const category of ACTION_CATEGORIES) {
            expect(typeof CATEGORY_LABEL_KEY[category]).toBe("string");
            expect(CATEGORY_LABEL_KEY[category].length).toBeGreaterThan(0);
            expect(typeof CATEGORY_EMOJI[category]).toBe("string");
            expect(CATEGORY_EMOJI[category].length).toBeGreaterThan(0);
        }
    });
});
