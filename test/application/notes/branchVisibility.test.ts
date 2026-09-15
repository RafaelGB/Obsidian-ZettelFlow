import { describe, it, expect } from "@jest/globals";
import {
    explainClosedBranch,
    partitionBranches,
} from "application/notes/branchVisibility";
import type { EvalContext } from "application/notes/conditionEvaluator";

const context: EvalContext = {
    frontmatter: { state: "permanent", type: "idea" },
    noteTitle: "Atomicity",
    canvasName: "zettel",
};

const child = (id: string, label: string, tooltip?: string) => ({ id, label, tooltip });

describe("the wizard explains the branches it hides (#414)", () => {
    it("keeps open branches and hides closed ones", () => {
        const partition = partitionBranches(
            [
                child("a", "Permanent step", 'if: frontmatter.state === "permanent"'),
                child("b", "Fleeting step", 'if: frontmatter.state === "fleeting"'),
                child("c", "Always"),
            ],
            context
        );
        expect(partition.visible.map((entry) => entry.id)).toEqual(["a", "c"]);
        expect(partition.hidden.map((entry) => entry.id)).toEqual(["b"]);
        expect(partition.invalid).toEqual([]);
    });

    it("names the path, what it expected and what it found", () => {
        const partition = partitionBranches(
            [child("b", "Fleeting step", 'if: frontmatter.state === "fleeting"')],
            context
        );
        expect(partition.hidden[0].reason).toEqual({
            kind: "comparison",
            path: "frontmatter.state",
            operator: "===",
            expected: "fleeting",
            found: "permanent",
        });
    });

    it("says 'nothing' for a key the note does not have", () => {
        const partition = partitionBranches(
            [child("b", "Author step", 'if: frontmatter.author === "luhmann"')],
            context
        );
        expect(partition.hidden[0].reason).toMatchObject({ found: "nothing", expected: "luhmann" });
    });

    it("names the first failing comparison of an AND chain", () => {
        const reason = explainClosedBranch(
            'frontmatter.type === "idea" && frontmatter.state === "fleeting"',
            context
        );
        expect(reason).toMatchObject({ path: "frontmatter.state", expected: "fleeting" });
    });

    it("says every alternative failed for an OR", () => {
        const reason = explainClosedBranch(
            'frontmatter.state === "fleeting" || frontmatter.type === "source"',
            context
        );
        expect(reason).toEqual({
            kind: "all-failed",
            comparisons: ['frontmatter.state === "fleeting"', 'frontmatter.type === "source"'],
        });
    });

    it("falls back to the expression rather than inventing a story", () => {
        expect(explainClosedBranch("!frontmatter.type", context)).toEqual({ kind: "expression" });
        expect(explainClosedBranch("", context)).toEqual({ kind: "expression" });
    });

    it("keeps a malformed expression visible, and flags it for the author", () => {
        const partition = partitionBranches(
            [child("x", "Broken step", "if: frontmatter.state ===")],
            context
        );
        expect(partition.visible.map((entry) => entry.id)).toEqual(["x"]);
        expect(partition.invalid).toEqual(["Broken step"]);
        expect(partition.hidden).toEqual([]);
    });

    it("handles a canvas-name gate as well as a frontmatter one", () => {
        const partition = partitionBranches(
            [child("c", "Other canvas", 'if: canvas.name === "journal"')],
            context
        );
        expect(partition.hidden[0].reason).toMatchObject({
            path: "canvas.name",
            found: "zettel",
            expected: "journal",
        });
    });
});
