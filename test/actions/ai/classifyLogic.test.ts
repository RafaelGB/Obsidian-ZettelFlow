import { describe, it, expect } from "@jest/globals";
import { buildClassifyPrompt, parseClassification } from "actions/ai/classifyLogic";

describe("classify logic (#156, FR-6, AC-2)", () => {
    it("embeds the note content and asks for tags", () => {
        const prompt = buildClassifyPrompt("A note about sleep and memory.");
        expect(prompt).toContain("A note about sleep and memory.");
        expect(prompt.toLowerCase()).toContain("tag");
    });

    it("parses a comma or newline list into trimmed, deduped labels", () => {
        expect(parseClassification("sleep, memory ,  sleep\nbiology")).toEqual(["sleep", "memory", "biology"]);
    });

    it("strips list markers and returns [] on empty", () => {
        expect(parseClassification("- sleep\n* memory")).toEqual(["sleep", "memory"]);
        expect(parseClassification("   ")).toEqual([]);
    });
});
