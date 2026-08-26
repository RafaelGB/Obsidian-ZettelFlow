import { describe, it, expect } from "@jest/globals";
import { buildChallengePrompt } from "actions/ai/challengeIdeaLogic";

describe("challenge-idea logic (#184)", () => {
    it("embeds the note content and asks the model to argue against it", () => {
        const prompt = buildChallengePrompt("  Spaced repetition is the only way to learn.  ");
        expect(prompt).toContain("Spaced repetition is the only way to learn.");
        expect(prompt.toLowerCase()).toContain("argue against");
    });

    it("trims and delimits the note content (#301 S3)", () => {
        expect(buildChallengePrompt("  x  ")).toContain("<note-content>\nx\n</note-content>");
    });
});
