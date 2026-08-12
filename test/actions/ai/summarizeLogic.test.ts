import { describe, it, expect } from "@jest/globals";
import { buildSummarizePrompt } from "actions/ai/summarizeLogic";

describe("buildSummarizePrompt (#156, FR-6, D5)", () => {
    it("embeds the note content and a summarize instruction", () => {
        const prompt = buildSummarizePrompt("The mitochondria is the powerhouse of the cell.");
        expect(prompt).toContain("The mitochondria is the powerhouse of the cell.");
        expect(prompt.toLowerCase()).toContain("summar");
    });
});
