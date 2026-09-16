import { describe, it, expect } from "@jest/globals";
import { orderedTemplateSources } from "application/notes/stepBody";

describe("a step's template can come from a file or from the node itself (#426)", () => {
    it("keeps step order, whichever kind each step is", () => {
        const sources = orderedTemplateSources(
            new Map([
                [0, "steps/type.md"],
                [2, "steps/source.md"],
            ]),
            new Map([[1, "## Inline\n"]])
        );
        expect(sources).toEqual([
            { position: 0, path: "steps/type.md" },
            { position: 1, body: "## Inline\n" },
            { position: 2, path: "steps/source.md" },
        ]);
    });

    it("says nothing for a flow whose steps carry no template — today's behaviour", () => {
        expect(orderedTemplateSources(new Map(), new Map())).toEqual([]);
    });

    it("ignores an inline body that is only whitespace, so no empty block is appended", () => {
        expect(orderedTemplateSources(new Map(), new Map([[0, "   \n"]]))).toEqual([]);
    });

    it("prefers the file when a position somehow has both", () => {
        // A step note carries its body in the file; an inline body at the same position would be a
        // migration artefact, and the file is the one the author sees.
        const sources = orderedTemplateSources(
            new Map([[0, "steps/type.md"]]),
            new Map([[0, "ignored"]])
        );
        expect(sources).toEqual([{ position: 0, path: "steps/type.md" }]);
    });

    it("sorts by position rather than trusting insertion order", () => {
        const sources = orderedTemplateSources(
            new Map([
                [5, "late.md"],
                [1, "early.md"],
            ]),
            new Map([[3, "middle"]])
        );
        expect(sources.map((source) => source.position)).toEqual([1, 3, 5]);
    });
});
