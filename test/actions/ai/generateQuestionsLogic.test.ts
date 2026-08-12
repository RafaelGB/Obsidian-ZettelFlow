import { describe, it, expect } from "@jest/globals";
import { buildQuestionsPrompt, parseQuestions } from "actions/ai/generateQuestionsLogic";

describe("generate-questions logic (#156, FR-6, AC-2)", () => {
    it("embeds the note content and asks for questions", () => {
        const prompt = buildQuestionsPrompt("A note about sleep and memory.");
        expect(prompt).toContain("A note about sleep and memory.");
        expect(prompt.toLowerCase()).toContain("question");
    });

    it("parses a numbered or bulleted list, stripping markers", () => {
        expect(parseQuestions("1. Why sleep?\n2) How much?\n- What if not?")).toEqual([
            "Why sleep?",
            "How much?",
            "What if not?",
        ]);
    });

    it("returns [] on empty input", () => {
        expect(parseQuestions("\n  \n")).toEqual([]);
    });
});
