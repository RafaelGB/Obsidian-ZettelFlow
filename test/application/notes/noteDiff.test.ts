import { describe, it, expect } from "@jest/globals";
import {
    bodyBlocks,
    buildNoteDiff,
    diffFrontmatter,
    frontmatterConflicts,
    placeholderReplacements,
} from "application/notes/noteDiff";
import { assembleNotePreview } from "application/notes/previewAssembly";

describe("the preview says what will change, not just what it will look like (#412)", () => {
    it("marks keys the build adds", () => {
        const changes = diffFrontmatter({}, { state: "fleeting", type: "idea" });
        expect(changes).toEqual([
            { key: "state", kind: "added", value: "fleeting" },
            { key: "type", kind: "added", value: "idea" },
        ]);
    });

    it("distinguishes changed from unchanged against an existing note", () => {
        const changes = diffFrontmatter(
            { state: "fleeting", type: "idea" },
            { state: "permanent", type: "idea" }
        );
        expect(changes).toEqual([
            { key: "state", kind: "changed", value: "permanent", previous: "fleeting" },
            { key: "type", kind: "unchanged", value: "idea", previous: "idea" },
        ]);
    });

    it("compares by value, so an equal array is not a change", () => {
        const changes = diffFrontmatter({ aliases: ["a", "b"] }, { aliases: ["a", "b"] });
        expect(changes[0].kind).toBe("unchanged");
    });

    it("names the winner when two steps set the same key", () => {
        const conflicts = frontmatterConflicts([
            { label: "Type", frontmatter: { state: "fleeting" } },
            { label: "Maturity", frontmatter: { state: "permanent" } },
        ]);
        expect(conflicts).toEqual([
            {
                key: "state",
                winner: "permanent",
                winnerSource: "Maturity",
                overridden: [{ value: "fleeting", source: "Type" }],
            },
        ]);
    });

    it("agrees with the merge the builder actually performs", () => {
        const templates = [
            { body: "", frontmatter: { state: "fleeting" } },
            { body: "", frontmatter: { state: "permanent" } },
        ];
        const assembled = assembleNotePreview({
            title: "x",
            templates,
            elements: [],
            sourceFrontmatter: {},
            canvasName: "c",
            links: [],
        });
        const [conflict] = frontmatterConflicts([
            { label: "Type", frontmatter: templates[0].frontmatter },
            { label: "Maturity", frontmatter: templates[1].frontmatter },
        ]);
        // The stated winner is what the assembly wrote — not a second opinion about the rule.
        expect(assembled.frontmatter.state).toBe(conflict.winner);
    });

    it("is silent when the two steps agree, and when tags pile up", () => {
        expect(
            frontmatterConflicts([
                { label: "a", frontmatter: { state: "fleeting" } },
                { label: "b", frontmatter: { state: "fleeting" } },
            ])
        ).toEqual([]);
        expect(
            frontmatterConflicts([
                { label: "a", frontmatter: { tags: ["one"] } },
                { label: "b", frontmatter: { tags: ["two"] } },
            ])
        ).toEqual([]);
    });

    it("counts every placeholder the document-wide replace will touch", () => {
        const document = "# Note\n\n{{topic}} and again {{topic}}\n\n{{absent}}";
        expect(placeholderReplacements(document, { topic: "atomicity", other: "x" })).toEqual([
            { key: "topic", value: "atomicity", occurrences: 2 },
        ]);
    });

    it("splits the body into the blocks a template contributes", () => {
        expect(bodyBlocks("one\n\ntwo\n\n\n three ")).toEqual(["one", "two", "three"]);
        expect(bodyBlocks("   ")).toEqual([]);
    });

    it("composes the whole diff, and reports no placeholders outside edit mode", () => {
        const diff = buildNoteDiff({
            baseline: { frontmatter: { state: "fleeting" }, body: "" },
            preview: { frontmatter: { state: "permanent" }, body: "a\n\nb" },
            sources: [
                { label: "Type", frontmatter: { state: "fleeting" } },
                { label: "Maturity", frontmatter: { state: "permanent" } },
            ],
        });
        expect(diff.frontmatter).toEqual([
            { key: "state", kind: "changed", value: "permanent", previous: "fleeting" },
        ]);
        expect(diff.bodyBlocks).toEqual(["a", "b"]);
        expect(diff.conflicts).toHaveLength(1);
        expect(diff.placeholders).toEqual([]);
    });
});
