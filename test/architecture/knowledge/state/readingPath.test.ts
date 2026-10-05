import { describe, it, expect } from "@jest/globals";
import { readFromHere, READING_PATH_CAP } from "architecture/knowledge/state";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

// The seed links out to B (supports) and C (plain), D contradicts the seed, E links in plainly.
const model = buildModel([
    idea("seed.md", "literature", [{ to: "B.md", type: "supports" }, { to: "C.md" }, { to: "ghost.md" }, { to: "seed.md" }]),
    idea("B.md", "permanent"),
    idea("C.md", "permanent"),
    idea("D.md", "permanent", [{ to: "seed.md", type: "contradicts" }]),
    idea("E.md", "permanent", [{ to: "seed.md" }]),
]);

describe("readFromHere — the R1 path (#668)", () => {
    it("starts at the seed, then its links out in link order, then the notes that link to it", () => {
        expect(readFromHere(model, "seed.md").chapters.map((c) => c.path)).toEqual([
            "seed.md",
            "B.md",
            "C.md",
            "D.md",
            "E.md",
        ]);
    });

    it("tags each chapter with its role to the seed, from the typed relations", () => {
        expect(readFromHere(model, "seed.md").chapters.map((c) => c.role)).toEqual([
            "thesis",
            "support",
            "context",
            "counter",
            "context",
        ]);
    });

    it("leaves out unresolved links and links to itself", () => {
        const paths = readFromHere(model, "seed.md").chapters.map((c) => c.path);
        expect(paths).not.toContain("ghost.md");
        expect(paths.filter((p) => p === "seed.md")).toHaveLength(1);
    });

    it("calls the seed context when nothing argues with or supports it", () => {
        const plain = buildModel([idea("a.md", "fleeting", [{ to: "b.md" }]), idea("b.md", "fleeting")]);
        expect(readFromHere(plain, "a.md").chapters.map((c) => c.role)).toEqual(["context", "context"]);
    });

    it("never runs longer than the cap", () => {
        const many = buildModel([
            idea("hub.md", "permanent", Array.from({ length: 30 }, (_, i) => ({ to: `n${i}.md` }))),
            ...Array.from({ length: 30 }, (_, i) => idea(`n${i}.md`, "fleeting")),
        ]);
        expect(readFromHere(many, "hub.md").chapters).toHaveLength(READING_PATH_CAP);
    });

    it("still reads a note the model does not know, on its own", () => {
        expect(readFromHere(model, "outside.md")).toEqual({
            seed: "outside.md",
            chapters: [{ path: "outside.md", role: "context" }],
        });
    });
});
