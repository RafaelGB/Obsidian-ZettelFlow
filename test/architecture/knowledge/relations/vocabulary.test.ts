import { describe, it, expect } from "@jest/globals";
import {
    SEMANTIC_RELATION_TYPES,
    DEFAULT_RELATION_TYPE,
    isRelationType,
    isSemanticRelationType,
} from "architecture/knowledge/relations/vocabulary";

describe("relation vocabulary", () => {
    it("defines the seven semantic types", () => {
        expect([...SEMANTIC_RELATION_TYPES]).toEqual([
            "supports",
            "contradicts",
            "expands",
            "inspired-by",
            "question",
            "example",
            "implements",
        ]);
    });

    it("re-exports the plain link fallback", () => {
        expect(DEFAULT_RELATION_TYPE).toBe("link");
    });

    it("isSemanticRelationType is true only for the semantic set", () => {
        expect(isSemanticRelationType("supports")).toBe(true);
        expect(isSemanticRelationType("link")).toBe(false);
        expect(isSemanticRelationType("foobar")).toBe(false);
    });

    it("isRelationType accepts semantic types and link, rejects unknown", () => {
        expect(isRelationType("contradicts")).toBe(true);
        expect(isRelationType("link")).toBe(true);
        expect(isRelationType("foobar")).toBe(false);
    });
});
