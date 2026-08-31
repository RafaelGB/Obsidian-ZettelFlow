import { describe, it, expect } from "@jest/globals";
import {
    deriveRecommendations,
    RECOMMENDATION_REASONS,
} from "architecture/knowledge/state/recommendation";
import type { Judgement } from "architecture/knowledge/judgement";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

const T0 = Date.UTC(2026, 7, 31, 10, 0, 0);

const model = buildModel([
    idea("hub.md", "permanent", [{ to: "h1.md" }, { to: "h2.md" }, { to: "h3.md" }, { to: "h4.md" }]),
    ...["h1", "h2", "h3", "h4"].map((name) => idea(`${name}.md`, "permanent", [])),
]);

const ruled: Judgement[] = [
    { at: T0, path: "hub.md", subject: "friction:challenge", origin: "derived", verdict: "challenged" },
];

describe("the re-engage recommendation (#339, FR-2/AC-3)", () => {
    it("joins the closed reason vocabulary", () => {
        expect(RECOMMENDATION_REASONS).toContain("re-engage");
    });

    it("names the ideas that grew without your judgement", () => {
        const reEngage = deriveRecommendations(model, []).find((r) => r.reason === "re-engage");

        expect(reEngage?.target).toEqual(["hub.md"]);
    });

    it("goes quiet once you have ruled on them", () => {
        expect(deriveRecommendations(model, ruled).some((r) => r.reason === "re-engage")).toBe(false);
    });

    it("flows through the existing priority ordering, with no bespoke ranking", () => {
        const all = deriveRecommendations(model, []);
        const priorities = all.map((r) => r.priority);

        expect([...priorities].sort((a, b) => b - a)).toEqual(priorities);
        const reEngage = all.find((r) => r.reason === "re-engage");
        expect(reEngage?.priority).toBeGreaterThan(0);
        expect(reEngage?.priority).toBeLessThan(1);
    });

    it("behaves exactly as before when no history is supplied", () => {
        // Every existing caller passes the model alone; none of them may change behaviour.
        expect(deriveRecommendations(model)).toEqual(deriveRecommendations(model, []).filter((r) => r.reason !== "re-engage"));
    });

    it("says nothing about an empty model", () => {
        expect(deriveRecommendations(buildModel([]), []).some((r) => r.reason === "re-engage")).toBe(false);
    });
});
