import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import {
    mergeFrontmatterDelta,
} from "application/patterns/postIndexRerunCore";

describe("mergeFrontmatterDelta (#200, FR-4, AC-4)", () => {
    beforeEach(() => jest.restoreAllMocks());

    it("folds the delta over existing keys, delta wins, untouched keys survive byte-for-byte", () => {
        const existing = { tags: ["a"], aliases: ["x"], custom: "keep" };
        const delta = { related: ["[[N]]"], maturity: 3 };

        const merged = mergeFrontmatterDelta(existing, delta);

        expect(merged).toEqual({
            tags: ["a"],
            aliases: ["x"],
            custom: "keep",
            related: ["[[N]]"],
            maturity: 3,
        });
    });

    it("overwrites only the keys present in the delta", () => {
        const existing = { related: ["[[old]]"], custom: "keep" };
        const delta = { related: ["[[new]]"] };

        const merged = mergeFrontmatterDelta(existing, delta);

        expect(merged.related).toEqual(["[[new]]"]);
        expect(merged.custom).toBe("keep");
    });

    it("does not mutate the inputs", () => {
        const existing = { custom: "keep" };
        const delta = { related: ["[[N]]"] };

        mergeFrontmatterDelta(existing, delta);

        expect(existing).toEqual({ custom: "keep" });
        expect(delta).toEqual({ related: ["[[N]]"] });
    });
});
