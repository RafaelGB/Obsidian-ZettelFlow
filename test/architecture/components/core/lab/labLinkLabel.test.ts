import { describe, it, expect } from "@jest/globals";
import { linkLabel } from "architecture/components/core/lab/LabRenderer";
import type { Thought } from "application/thinking/thought";

const base: Thought = { id: "a", at: 1, text: "", links: [] };

describe("a connection chip names what it joins (#747 FR-4)", () => {
    it("says a thought's own words", () => {
        expect(linkLabel({ ...base, text: "Effort is a currency" })).toBe("Effort is a currency");
    });

    it("says a highlight's passage when it has no note — what an arrow between two marks links", () => {
        expect(linkLabel({ ...base, about: "b.md", quote: { exact: "goes unasked for a while", prefix: "", suffix: "" } })).toBe("goes unasked for a while");
    });

    it("says it is ink for an ink note", () => {
        expect(linkLabel({ ...base, about: "b.md", quote: { exact: "word", prefix: "", suffix: "" }, ink: { drawing: "1.svg", side: "left", x: 0, line: 0, em: 16 } })).toBe("an ink note");
    });
});
