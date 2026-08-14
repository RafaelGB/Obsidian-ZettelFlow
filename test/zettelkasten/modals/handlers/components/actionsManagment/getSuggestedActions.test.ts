import { describe, it, expect } from "@jest/globals";
import { getSuggestedActions } from "zettelkasten/modals/handlers/components/actionsManagment/getSuggestedActions";
import type { ActionCardInfo } from "zettelkasten/modals/handlers/components/actionsManagment/typing";

function makeRegistry(ids: string[]): ActionCardInfo[] {
    return ids.map((id) => ({
        id,
        icon: "file",
        label: id,
        purpose: `${id} purpose`,
    }));
}

const FULL_REGISTRY = makeRegistry([
    "prompt",
    "create-semantic-relation",
    "detect-orphan",
    "calculate-maturity",
    "summarize",
    "suggest-connections",
    "find-related",
    "suggest-link",
    "extract-claims",
    "compare-claims",
    "generate-questions",
    "thinking-simulator",
]);

describe("getSuggestedActions (#256 FR-14, FR-18, AC-10)", () => {
    it("returns empty array when no existing actions", () => {
        const result = getSuggestedActions([], FULL_REGISTRY);
        expect(result).toEqual([]);
    });

    it("returns create-semantic-relation when prompt is added", () => {
        const result = getSuggestedActions(["prompt"], FULL_REGISTRY);
        const ids = result.map((c) => c.id);
        expect(ids).toContain("create-semantic-relation");
    });

    it("returns calculate-maturity when detect-orphan is added", () => {
        const result = getSuggestedActions(["detect-orphan"], FULL_REGISTRY);
        const ids = result.map((c) => c.id);
        expect(ids).toContain("calculate-maturity");
    });

    it("returns empty when all suggestions are already added", () => {
        const result = getSuggestedActions(
            ["prompt", "create-semantic-relation"],
            FULL_REGISTRY
        );
        // create-semantic-relation is the only affinity partner for prompt; already added
        const ids = result.map((c) => c.id);
        expect(ids).not.toContain("create-semantic-relation");
    });

    it("caps result at 3 items", () => {
        const result = getSuggestedActions(
            ["detect-orphan", "summarize", "find-related", "extract-claims", "generate-questions"],
            FULL_REGISTRY
        );
        expect(result.length).toBeLessThanOrEqual(3);
    });
});
