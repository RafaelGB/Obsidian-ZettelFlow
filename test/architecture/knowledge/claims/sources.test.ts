import { describe, it, expect } from "@jest/globals";
import { classifySources } from "architecture/knowledge/claims/sources";

const resolved = { A: "a.md", "Deep Work": "deep.md" };

describe("classifySources", () => {
    it("classifies a resolved wikilink as a link source (path ref)", () => {
        expect(classifySources("[[A]]", resolved)).toEqual([{ ref: "a.md", kind: "link" }]);
    });

    it("strips alias and heading before resolving", () => {
        expect(classifySources("[[Deep Work|DW]]", resolved)).toEqual([{ ref: "deep.md", kind: "link" }]);
        expect(classifySources("[[A#section]]", resolved)).toEqual([{ ref: "a.md", kind: "link" }]);
    });

    it("excludes unresolved links", () => {
        expect(classifySources("[[Missing]]", resolved)).toEqual([]);
    });

    it("classifies free text (URL/citation) as text, trimmed", () => {
        expect(classifySources("  https://example.com/x  ", resolved)).toEqual([
            { ref: "https://example.com/x", kind: "text" },
        ]);
        expect(classifySources("Smith 2020, p.42", resolved)).toEqual([
            { ref: "Smith 2020, p.42", kind: "text" },
        ]);
    });

    it("handles a list of mixed sources", () => {
        expect(classifySources(["[[A]]", "doi:10/x"], resolved)).toEqual([
            { ref: "a.md", kind: "link" },
            { ref: "doi:10/x", kind: "text" },
        ]);
    });
});
