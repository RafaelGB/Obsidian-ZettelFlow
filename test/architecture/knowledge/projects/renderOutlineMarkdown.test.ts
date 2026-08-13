import { describe, it, expect } from "@jest/globals";
import { renderOutlineMarkdown } from "architecture/knowledge/projects/renderOutlineMarkdown";

describe("renderOutlineMarkdown (#173, AC-1 render)", () => {
    it("renders a MOC: H1 title, ## per section, - [[basename]] per note", () => {
        const outline = {
            sections: [
                { title: "Foundations", notes: ["book/a.md", "book/shared.md"] },
                { title: "Misc", notes: ["book/lonely.md"] },
            ],
        };
        expect(renderOutlineMarkdown(outline, { title: "book — project outline" })).toBe(
            "# book — project outline\n\n## Foundations\n\n- [[a]]\n- [[shared]]\n\n## Misc\n\n- [[lonely]]\n"
        );
    });

    it("renders just the title for an empty outline", () => {
        expect(renderOutlineMarkdown({ sections: [] }, { title: "book — project outline" })).toBe(
            "# book — project outline\n"
        );
    });
});
