import { describe, it, expect } from "@jest/globals";
import {
    groupActionsByCategory,
    getActionCategory,
    type ActionCategory,
} from "architecture/api/categories/categories";

type Item = { id: string; category?: ActionCategory };

describe("groupActionsByCategory (#152, AC-2/AC-3)", () => {
    it("groups by category in canonical order, uncategorized last", () => {
        const items: Item[] = [
            { id: "a", category: "relations" },
            { id: "b", category: "manipulation" },
            { id: "c" }, // uncategorized
            { id: "d", category: "manipulation" },
        ];
        const groups = groupActionsByCategory(items);
        expect(groups.map((g) => g.category)).toEqual(["manipulation", "relations", null]);
        expect(groups[0].items.map((i) => i.id)).toEqual(["b", "d"]);
        expect(groups[2].items.map((i) => i.id)).toEqual(["c"]);
    });

    it("omits empty categories (knowledge/research/ai when unused)", () => {
        const groups = groupActionsByCategory([{ id: "a", category: "manipulation" }]);
        expect(groups.map((g) => g.category)).toEqual(["manipulation"]);
    });

    it("omits the uncategorized group when every item has a category", () => {
        const groups = groupActionsByCategory([{ id: "a", category: "manipulation" }]);
        expect(groups.some((g) => g.category === null)).toBe(false);
    });

    it("buckets an item with an absent or invalid category as uncategorized", () => {
        const items = [
            { id: "a" },
            { id: "b", category: "bogus" as unknown as ActionCategory },
        ];
        const groups = groupActionsByCategory(items);
        expect(groups).toHaveLength(1);
        expect(groups[0].category).toBeNull();
        expect(groups[0].items.map((i) => i.id)).toEqual(["a", "b"]);
    });

    it("getActionCategory returns null for an absent or invalid token", () => {
        expect(getActionCategory("manipulation")).toBe("manipulation");
        expect(getActionCategory(undefined)).toBeNull();
        expect(getActionCategory("misc")).toBeNull();
    });
});
