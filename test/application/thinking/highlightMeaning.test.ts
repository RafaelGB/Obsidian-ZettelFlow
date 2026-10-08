import { describe, it, expect } from "@jest/globals";
import { newThought, parseThought, renderThought } from "application/thinking/thought";
import { HIGHLIGHT_MEANINGS, meaningOf } from "application/thinking/highlightMeaning";
import { isEmptyQuery, matchesThought } from "application/thinking/labSearch";

const NOW = 1_700_000_000_000;
const QUOTE = { exact: "a deep module hides far more than it shows", prefix: "", suffix: "" };

describe("highlight meanings — four, closed, and yours (#720)", () => {
    it("are exactly four, in the order the popover offers them", () => {
        expect(HIGHLIGHT_MEANINGS).toEqual(["idea", "question", "quote", "discuss"]);
    });

    it("travel with the thought: written to its file and read back", () => {
        const thought = newThought({ text: "", id: "h1", at: NOW, about: "Books/a.epub", quote: QUOTE, meaning: "question" });
        const back = parseThought(renderThought(thought), "lab/h1.md");
        expect(back.meaning).toBe("question");
        expect(meaningOf(back)).toBe("question");
    });

    it("read a highlight made before meanings as an idea, and write nothing for it", () => {
        const old = newThought({ text: "", id: "h0", at: NOW, about: "Books/a.epub", quote: QUOTE });
        expect(renderThought(old)).not.toContain("meaning");
        expect(meaningOf(parseThought(renderThought(old), "lab/h0.md"))).toBe("idea");
    });

    it("never takes a meaning it does not know", () => {
        const file = renderThought(newThought({ text: "", id: "h2", at: NOW, about: "a.md", quote: QUOTE })).replace("quoteExact", 'meaning: "scheme"\n  quoteExact');
        expect(parseThought(file, "lab/h2.md").meaning).toBeUndefined();
    });
});

describe("Think filters by what a highlight means (#720)", () => {
    const highlight = (id: string, meaning?: "question" | "quote") =>
        ({ ...newThought({ text: "", id, at: NOW, about: "Books/a.epub", quote: QUOTE }), ...(meaning ? { meaning } : {}) });

    it("keeps only the highlights with that meaning, an old one counting as an idea", () => {
        expect(matchesThought(highlight("q", "question"), { meaning: "question" })).toBe(true);
        expect(matchesThought(highlight("c", "quote"), { meaning: "question" })).toBe(false);
        expect(matchesThought(highlight("old"), { meaning: "idea" })).toBe(true);
    });

    it("never matches a plain thought, which has no meaning to filter by", () => {
        expect(matchesThought(newThought({ text: "a plain thought", id: "p", at: NOW }), { meaning: "idea" })).toBe(false);
        expect(isEmptyQuery({ meaning: "idea" })).toBe(false);
    });
});
