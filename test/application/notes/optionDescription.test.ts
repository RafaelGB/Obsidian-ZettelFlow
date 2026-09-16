import { describe, it, expect } from "@jest/globals";
import { describeOption } from "application/notes/optionDescription";

describe("an option's description is for a person, not for the parser (#423)", () => {
    it("says nothing when the label is only a condition", () => {
        expect(describeOption('if: frontmatter.state === "fleeting"')).toBeUndefined();
        expect(describeOption("IF: note.title === 'x'")).toBeUndefined();
        expect(describeOption("   if:   canvas.name === 'zettel'  ")).toBeUndefined();
    });

    it("keeps a human label exactly as written", () => {
        expect(describeOption("Es algo que he leído")).toBe("Es algo que he leído");
        expect(describeOption("Source · book")).toBe("Source · book");
    });

    it("keeps the human half when a label carries both", () => {
        expect(describeOption('Fuente — if: frontmatter.type === "source"')).toBe("Fuente");
        expect(describeOption('Fuente if: frontmatter.type === "source"')).toBe("Fuente");
    });

    it("is not fooled by a label that merely contains the word if", () => {
        expect(describeOption("a gift")).toBe("a gift");
        expect(describeOption("Only if you read it")).toBe("Only if you read it");
        expect(describeOption("motif: a recurring idea")).toBe("motif: a recurring idea");
    });

    it("says nothing for an empty or absent label", () => {
        expect(describeOption("")).toBeUndefined();
        expect(describeOption("   ")).toBeUndefined();
        expect(describeOption(undefined)).toBeUndefined();
    });
});
