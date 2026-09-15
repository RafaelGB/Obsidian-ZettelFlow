import { describe, it, expect } from "@jest/globals";
import { satelliteSummary } from "zettelkasten/modals/handlers/satelliteSummary";

const declared = {
    template: "steps/permanent.md",
    title: "{{title}} — idea",
    targetFolder: "zettel/ideas",
    relation: { type: "inspired-by" as const, direction: "satellite-to-main" as const },
};

describe("the step editor states a linked-note declaration, and its defects (#419, AC-7)", () => {
    it("says nothing at all when the step declares none", () => {
        expect(satelliteSummary(undefined)).toBeUndefined();
    });

    it("lists what was declared", () => {
        const summary = satelliteSummary(declared);
        expect(summary).toEqual({
            rows: [
                { label: "satellite_summary_template", value: "steps/permanent.md" },
                { label: "satellite_summary_title", value: "{{title}} — idea" },
                { label: "satellite_summary_folder", value: "zettel/ideas" },
                { label: "satellite_summary_relation", value: "inspired-by (satellite-to-main)" },
            ],
        });
    });

    it("says where it lands when no folder was declared", () => {
        const summary = satelliteSummary({ ...declared, targetFolder: undefined });
        expect(summary?.rows[2]).toEqual({
            label: "satellite_summary_folder",
            value: "satellite_summary_folder_inherited",
        });
    });

    it("reports a defect instead of pretending the declaration is usable", () => {
        expect(satelliteSummary({ ...declared, template: "" })?.error).toBe("template-missing");
        expect(satelliteSummary({ ...declared, title: " " })?.error).toBe("title-empty");
        expect(
            satelliteSummary({
                ...declared,
                relation: { type: "source", direction: "satellite-to-main" },
            })?.error
        ).toBe("relation-invalid");
    });

    it("still lists the rows when there is a defect, so the author can see what to fix", () => {
        const summary = satelliteSummary({ ...declared, template: "" });
        expect(summary?.rows).toHaveLength(4);
        expect(summary?.rows[0].value).toBe("satellite_summary_missing");
    });
});
