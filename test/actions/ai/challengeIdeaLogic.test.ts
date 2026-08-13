import { describe, it, expect } from "@jest/globals";
import { buildChallengePrompt } from "actions/ai/challengeIdeaLogic";

describe("challenge-idea logic (#184)", () => {
    it("embeds the note content and asks the model to argue against it", () => {
        const prompt = buildChallengePrompt("  Spaced repetition is the only way to learn.  ");
        expect(prompt).toContain("Spaced repetition is the only way to learn.");
        expect(prompt.toLowerCase()).toContain("argue against");
    });

    it("trims the surrounding whitespace of the note content", () => {
        expect(buildChallengePrompt("  x  ").endsWith("x")).toBe(true);
    });
});
