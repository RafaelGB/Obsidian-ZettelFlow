import { describe, it, expect } from "@jest/globals";
import {
    topRecommendations,
    isAllCaughtUp,
    REASON_LABEL_KEYS,
    HOME_RECOMMENDATIONS_LIMIT,
} from "architecture/components/core/home/homeRecommendations";
import { deriveRecommendations, RECOMMENDATION_REASONS } from "architecture/knowledge/state";
import type { KnowledgeRecommendation } from "architecture/knowledge/state";
import en from "architecture/lang/locale/en";
import { idea, buildModel } from "../../../../actions/knowledge/support/knowledgeFixture";

// A model with several signals so deriveRecommendations returns multiple rows.
const model = buildModel([
    idea("iso.md", "permanent", []),
    idea("d.md", "permanent", [{ to: "missing.md" }]),
    idea("x.md", "permanent", [{ to: "y.md", type: "contradicts" }]),
    idea("y.md", "permanent", []),
    idea("q1.md", "permanent", [{ to: "q2.md", type: "question" }]),
    idea("q2.md", "permanent", []),
    idea("f1.md", "fleeting", [{ to: "iso.md" }]),
]);

describe("home recommendations (#273, AC-1/AC-2/AC-3)", () => {
    it("topRecommendations is a pure priority-desc slice of the primitive", () => {
        const top = topRecommendations(model, 3);
        expect(top).toEqual(deriveRecommendations(model).slice(0, 3));
        for (let i = 1; i < top.length; i++) expect(top[i - 1].priority).toBeGreaterThanOrEqual(top[i].priority);
    });

    it("returns an empty list for an empty model and defaults the limit", () => {
        expect(topRecommendations(buildModel([]))).toEqual([]);
        expect(topRecommendations(model).length).toBeLessThanOrEqual(HOME_RECOMMENDATIONS_LIMIT);
    });

    it("isAllCaughtUp is true for no rows or only all-clear, false otherwise", () => {
        expect(isAllCaughtUp([])).toBe(true);
        expect(isAllCaughtUp([{ reason: "all-clear", target: [], command: null, priority: 0 }])).toBe(true);
        expect(isAllCaughtUp([{ reason: "connect", target: ["a.md"], command: "create-semantic-relation", priority: 0.7 } as KnowledgeRecommendation])).toBe(false);
    });

    it("maps every reason to an existing, non-empty label key (exhaustive)", () => {
        const enMap = en as Record<string, string>;
        for (const reason of RECOMMENDATION_REASONS) {
            const key = REASON_LABEL_KEYS[reason];
            expect(typeof key).toBe("string");
            expect(typeof enMap[key]).toBe("string");
            expect(enMap[key].length).toBeGreaterThan(0);
        }
    });
});
