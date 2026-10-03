import { describe, it, expect } from "@jest/globals";
import { nextStepCard, connectCandidates, suggestNextMoves } from "architecture/knowledge/state";
import { proposedNextState } from "architecture/knowledge/lifecycle/machine";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

// AC-1: a fleeting note with one claim, no source and no links.
const model = buildModel([
    idea("lonely.md", "fleeting", [], { claims: [{ text: "one" }] }),
    idea("linked.md", "literature", [{ to: "a.md" }], {
        hasSources: true,
        claims: [{ text: "x", sources: [{ ref: "Book", kind: "text" }] }],
    }),
    idea("a.md", "permanent", [{ to: "linked.md" }]),
    idea("b.md", "permanent", [{ to: "linked.md" }]),
    idea("done.md", "permanent", [{ to: "a.md", type: "example" }], {
        hasSources: true,
        claims: [{ text: "y", sources: [{ ref: "Book", kind: "text" }] }],
    }),
]);

describe("nextStepCard (#641 FR-1..8, AC-1..4)", () => {
    it("states the facts behind each move of the AC-1 note", () => {
        expect(nextStepCard(model, "lonely.md")).toEqual({
            kind: "proposing",
            moves: [
                { token: "add-source", unsourced: 1 },
                { token: "connect" },
                { token: "advance-state", current: "fleeting", proposed: "literature" },
            ],
        });
    });

    it("never reorders, adds or drops a move: it is suggestNextMoves, one to one", () => {
        for (const path of ["lonely.md", "linked.md", "a.md", "b.md", "done.md"]) {
            const card = nextStepCard(model, path);
            const tokens = card.kind === "proposing" ? card.moves.map((move) => move.token) : [];
            expect({ path, tokens }).toEqual({ path, tokens: suggestNextMoves(model, path) });
        }
    });

    it("offers both directions as example candidates (Q3)", () => {
        const card = nextStepCard(model, "linked.md");
        const example = card.kind === "proposing" ? card.moves.find((move) => move.token === "add-example") : undefined;
        expect(example).toEqual({ token: "add-example", linksOut: ["a.md"], linksIn: ["a.md", "b.md"] });
    });

    it("is complete when nothing is pending, and absent for a note the model does not know", () => {
        expect(nextStepCard(model, "done.md")).toEqual({ kind: "complete" });
        expect(nextStepCard(model, "nowhere.md")).toEqual({ kind: "absent" });
    });
});

describe("connectCandidates (#641 FR-11)", () => {
    const rows = ["n1", "n2", "n3", "n4", "n5", "n6"].map((name) => ({ path: `${name}.md`, basename: name, reasons: [] }));

    it("drops what the note already links to and keeps at most four, in ranking order", () => {
        expect(connectCandidates(rows, new Set(["n2.md"])).map((row) => row.basename)).toEqual(["n1", "n3", "n4", "n5"]);
    });
});

describe("proposedNextState (#641 FR-5, one home with Cultivate)", () => {
    it("moves forward and never proposes archiving while another step is open", () => {
        expect(proposedNextState("fleeting")).toBe("literature");
        expect(proposedNextState("literature")).toBe("permanent");
        expect(proposedNextState("permanent")).toBe("developing");
        expect(proposedNextState("archived")).toBe("fleeting");
    });

    it("reads an unknown state as fleeting", () => {
        expect(proposedNextState("unknown")).toBe("literature");
    });
});
