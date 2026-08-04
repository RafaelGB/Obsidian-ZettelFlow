import { describe, it, expect } from "@jest/globals";
import { substitutePreviewTokens } from "application/notes/previewUtils";

describe("substitutePreviewTokens", () => {
    it("substitutes {{title}} with the given title", () => {
        expect(substitutePreviewTokens("# {{title}}", "Hello", "2024-01-01")).toBe("# Hello");
    });

    it("falls back to 'My note' when title is empty", () => {
        expect(substitutePreviewTokens("# {{title}}", "", "2024-01-01")).toBe("# My note");
    });

    it("substitutes {{date}} with the given date", () => {
        expect(substitutePreviewTokens("Created: {{date}}", "T", "2024-06-15")).toBe("Created: 2024-06-15");
    });

    it("clears {{frontmatter.*}} tokens", () => {
        expect(substitutePreviewTokens("Tags: {{frontmatter.tags}}", "T", "d")).toBe("Tags: ");
    });

    it("clears {{canvas.name}} token", () => {
        expect(substitutePreviewTokens("From: {{canvas.name}}", "T", "d")).toBe("From: ");
    });

    it("clears unknown tokens", () => {
        expect(substitutePreviewTokens("{{unknown}}", "T", "d")).toBe("");
    });

    it("handles a template with multiple tokens", () => {
        const result = substitutePreviewTokens(
            "# {{title}}\n{{date}}\n{{frontmatter.author}}",
            "Test",
            "2024-01-01"
        );
        expect(result).toBe("# Test\n2024-01-01\n");
    });

    it("returns the template unchanged when there are no tokens", () => {
        expect(substitutePreviewTokens("plain text", "T", "d")).toBe("plain text");
    });
});
