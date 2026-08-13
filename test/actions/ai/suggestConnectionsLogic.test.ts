import { describe, it, expect } from "@jest/globals";
import { buildConnectionsPrompt, parseConnections } from "actions/ai/suggestConnectionsLogic";

describe("suggest-connections logic (#184)", () => {
    it("embeds the note content and asks for links/connections", () => {
        const prompt = buildConnectionsPrompt("A note about memory consolidation.");
        expect(prompt).toContain("A note about memory consolidation.");
        expect(prompt.toLowerCase()).toContain("link");
    });

    it("parses a numbered or bulleted list, stripping markers", () => {
        expect(parseConnections("1. Sleep\n2) Hippocampus\n- Forgetting curve")).toEqual([
            "Sleep",
            "Hippocampus",
            "Forgetting curve",
        ]);
    });

    it("returns [] on empty input", () => {
        expect(parseConnections("\n  \n")).toEqual([]);
    });
});
