import { describe, it, expect } from "@jest/globals";
import { scopeFactsOf } from "architecture/knowledge/scopeFacts";

describe("what the scope rules can see of a note (#713)", () => {
    it("reads frontmatter tags and body tags alike, and the properties", () => {
        const facts = scopeFactsOf({ frontmatter: { tags: ["a"], status: "done" }, tags: [{ tag: "#b" }] } as never, "n.md");
        expect(facts.tags).toEqual(["#a", "#b"]);
        expect(facts.frontmatter).toEqual({ tags: ["a"], status: "done" });
        expect(facts.path).toBe("n.md");
    });

    it("a note Obsidian has not parsed yet is its path and nothing else", () => {
        expect(scopeFactsOf(null, "n.md")).toEqual({ path: "n.md", tags: [], frontmatter: null });
    });
});
