import { describe, it, expect } from "@jest/globals";
import { exitFrontmatter } from "application/notes/exitFrontmatter";
import { partitionExits, ExitCandidate, StepExits } from "application/notes/stepExits";
import type { FinalElement } from "application/notes/typing";

const answer = (key: string, result: unknown, zone?: string): FinalElement =>
    ({ type: "selector", id: `a-${key}`, hasUI: true, key, zone, result }) as unknown as FinalElement;

describe("exitFrontmatter (#898)", () => {
    it("opens the exit the wizard answer chose when there is no source note", () => {
        // Zettelkasten v2's capture step: a selector writes `origin`, three exits gate on it.
        const children: ExitCandidate[] = [
            { id: "fleeting", label: "Fleeting note", edgeId: "to-fleeting" },
            { id: "literature", label: "Literature note", edgeId: "to-literature" },
            { id: "permanent", label: "Permanent note", edgeId: "to-permanent" },
        ];
        const exits: StepExits = {
            "to-fleeting": { when: 'frontmatter.origin === "fleeting"' },
            "to-literature": { when: 'frontmatter.origin === "source"' },
            "to-permanent": { when: 'frontmatter.origin === "idea"' },
        };
        const elements = new Map([[0, answer("origin", "source", "frontmatter")]]);

        const { visible } = partitionExits(children, exits, {
            frontmatter: exitFrontmatter({}, elements),
        });

        expect(visible.map((child) => child.id)).toEqual(["literature"]);
    });

    it("lets a wizard answer win over the source note, and keeps the rest of the source", () => {
        const elements = new Map([[0, answer("stage", "draft")]]);

        expect(exitFrontmatter({ stage: "idea", project: "Atlas" }, elements)).toEqual({
            stage: "draft",
            project: "Atlas",
        });
    });

    it("ignores answers that are not frontmatter, have no key, or have no value yet", () => {
        const elements = new Map<number, FinalElement>([
            [0, answer("seed", "a thought", "context")],
            [1, answer("summary", "words", "body")],
            [2, answer("pending", null, "frontmatter")],
            [3, { type: "zettel-id", id: "z", hasUI: false, result: "2026" } as unknown as FinalElement],
        ]);

        expect(exitFrontmatter({ kind: "book" }, elements)).toEqual({ kind: "book" });
    });

    it("uses the static value of a static answer", () => {
        const elements = new Map([
            [0, { ...answer("para", null), staticBehaviour: true, staticValue: "project" } as FinalElement],
        ]);

        expect(exitFrontmatter({}, elements)).toEqual({ para: "project" });
    });
});
