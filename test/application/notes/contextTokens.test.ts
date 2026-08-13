import { describe, it, expect } from "@jest/globals";
import { substituteContextTokens } from "application/notes/contextTokens";

describe("substituteContextTokens", () => {
    it("replaces {{frontmatter.KEY}} with the frontmatter value", () => {
        expect(
            substituteContextTokens("Written by {{frontmatter.author}}.", { author: "Ada Lovelace" }, "Canvas")
        ).toBe("Written by Ada Lovelace.");
    });

    it("replaces missing key with empty string", () => {
        expect(
            substituteContextTokens("Type: {{frontmatter.nonexistent}}.", {}, "Canvas")
        ).toBe("Type: .");
    });

    it("replaces null frontmatter value with empty string", () => {
        expect(
            substituteContextTokens("{{frontmatter.status}}", { status: null }, "Canvas")
        ).toBe("");
    });

    it("replaces {{canvas.name}} with canvas basename", () => {
        expect(
            substituteContextTokens("Canvas: {{canvas.name}}.", {}, "MyCanvas")
        ).toBe("Canvas: MyCanvas.");
    });

    it("replaces multiple tokens in one pass", () => {
        expect(
            substituteContextTokens("{{frontmatter.author}} in {{canvas.name}}", { author: "Ada" }, "Tasks")
        ).toBe("Ada in Tasks");
    });

    it("leaves unrelated {{title}} tokens unchanged", () => {
        expect(
            substituteContextTokens("{{title}} is unchanged", {}, "")
        ).toBe("{{title}} is unchanged");
    });

    it("handles keys with hyphens and underscores", () => {
        expect(
            substituteContextTokens("{{frontmatter.my-key}} {{frontmatter.my_key}}", { "my-key": "A", "my_key": "B" }, "")
        ).toBe("A B");
    });

    it("replaces all occurrences of the same token", () => {
        expect(
            substituteContextTokens("{{frontmatter.x}} and {{frontmatter.x}}", { x: "Y" }, "")
        ).toBe("Y and Y");
    });
});
