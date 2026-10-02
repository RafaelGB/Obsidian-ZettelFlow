import { describe, it, expect } from "@jest/globals";
import { isNoteNeighbour, noteNeighbourhood, noteVitals } from "architecture/knowledge/state";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

// Hub links out to five notes (one with two relations), is linked from three, links to itself,
// to a note that does not exist and to an attachment. Two-way with b.
const model = buildModel([
    idea("Hub.md", "permanent", [
        { to: "a.md", type: "supports" },
        { to: "b.md" },
        { to: "c.md", type: "expands" },
        { to: "d.md", type: "example" },
        { to: "d.md" },
        { to: "Hub.md" },
        { to: "Nowhere.md" },
        { to: "pic.png" },
    ]),
    idea("a.md", "permanent"),
    idea("b.md", "permanent", [{ to: "Hub.md" }]),
    idea("c.md", "permanent"),
    idea("d.md", "permanent"),
    idea("e.md", "permanent", [{ to: "Hub.md", type: "contradicts" }]),
    idea("f.md", "permanent", [{ to: "Hub.md" }]),
    idea("far.md", "permanent"),
    idea("old.md", "permanent"),
    idea("lost.md", "permanent"),
    idea("gone.md", "permanent"),
]);

const byPath = (path: string) => noteNeighbourhood(model, "Hub.md", []).neighbours.find((n) => n.path === path);

describe("noteNeighbourhood (#643 FR-2/3, AC-3)", () => {
    it("lists each neighbouring note once, and nothing that is not a note", () => {
        const paths = noteNeighbourhood(model, "Hub.md", []).neighbours.map((n) => n.path).sort();
        expect(paths).toEqual(["a.md", "b.md", "c.md", "d.md", "e.md", "f.md"]);
    });

    it("never counts a self-link, an unresolved target or an attachment", () => {
        expect(isNoteNeighbour(model, "Hub.md", "Hub.md")).toBe(false);
        expect(isNoteNeighbour(model, "Hub.md", "Nowhere.md")).toBe(false);
        expect(isNoteNeighbour(model, "Hub.md", "pic.png")).toBe(false);
        expect(isNoteNeighbour(model, "Hub.md", "a.md")).toBe(true);
    });

    it("classes each neighbour by its strongest relation, in either direction", () => {
        expect(byPath("e.md")).toMatchObject({ cls: "contradicts", inbound: true, outbound: false, inType: "contradicts" });
        expect(byPath("a.md")).toMatchObject({ cls: "supports", outbound: true, outType: "supports" });
        expect(byPath("d.md")).toMatchObject({ cls: "example", outType: "example" });
    });

    it("draws the other semantic types as plain links, keeping the real type for the list", () => {
        expect(byPath("c.md")).toMatchObject({ cls: "link", outType: "expands" });
    });

    it("knows which way each link runs", () => {
        expect(byPath("b.md")).toMatchObject({ inbound: true, outbound: true, outType: "link", inType: "link" });
        expect(byPath("f.md")).toMatchObject({ inbound: true, outbound: false, inType: "link" });
    });

    it("lists the links in and the links out completely", () => {
        const hood = noteNeighbourhood(model, "Hub.md", []);
        expect(hood.linksIn.map((n) => n.path).sort()).toEqual(["b.md", "e.md", "f.md"]);
        expect(hood.linksOut.map((n) => n.path).sort()).toEqual(["a.md", "b.md", "c.md", "d.md"]);
    });

    it("is empty for a note the model does not know", () => {
        expect(noteNeighbourhood(model, "missing.md", [])).toEqual({ neighbours: [], near: [], linksIn: [], linksOut: [] });
    });
});

describe("the order (#643 FR-6, AC-4)", () => {
    it("orders by relation, then two-way first, then title", () => {
        const many = buildModel([
            idea("Hub.md", "permanent", [
                ...["z", "y", "x"].map((n) => ({ to: `${n}.md` })),
                { to: "two.md" },
                { to: "s2.md", type: "supports" },
                { to: "s1.md", type: "supports" },
                { to: "ex.md", type: "example" },
                { to: "q.md", type: "question" },
            ]),
            ...["z", "y", "x", "s1", "s2", "ex", "q"].map((n) => idea(`${n}.md`, "permanent")),
            idea("two.md", "permanent", [{ to: "Hub.md" }]),
            idea("con.md", "permanent", [{ to: "Hub.md", type: "contradicts" }]),
        ]);
        expect(noteNeighbourhood(many, "Hub.md", []).neighbours.map((n) => n.path)).toEqual([
            "con.md",
            "s1.md",
            "s2.md",
            "ex.md",
            "q.md",
            "two.md",
            "x.md",
            "y.md",
            "z.md",
        ]);
    });
});

describe("the near ring (#643 FR-4, AC-5)", () => {
    it("is the first three nearby rows that are not already neighbours, in order", () => {
        const nearby = ["b.md", "far.md", "old.md", "a.md", "lost.md", "gone.md"].map((path) => ({
            path,
            basename: path.replace(/\.md$/, ""),
            reasons: [],
        }));
        expect(noteNeighbourhood(model, "Hub.md", nearby).near.map((n) => n.path)).toEqual([
            "far.md",
            "old.md",
            "lost.md",
        ]);
    });
});

describe("the header and the list count the same links (#643 FR-10)", () => {
    it("counts links in and out through the same filter", () => {
        const vitals = noteVitals(model, "Hub.md");
        const hood = noteNeighbourhood(model, "Hub.md", []);
        expect(vitals.linksIn).toBe(hood.linksIn.length);
        expect(vitals.linksOut).toBe(hood.linksOut.length);
        expect([vitals.linksIn, vitals.linksOut]).toEqual([3, 4]);
    });
});
