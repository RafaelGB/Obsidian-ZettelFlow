import { describe, it, expect } from "@jest/globals";
import { describeTemplateChanges } from "zettelkasten/review/templateChanges";

describe("applying a template says what it will change (#428, AC-5)", () => {
    it("says nothing when the template matches the step", () => {
        const step = { label: "Fuente", actions: [{ type: "prompt", id: "a" }], root: false };
        expect(describeTemplateChanges(step, step)).toEqual([]);
    });

    it("names each field, with what it says now and what it would say", () => {
        const changes = describeTemplateChanges(
            { label: "Fuente", targetFolder: "Sources", actions: [{ type: "prompt", id: "a" }] },
            { label: "Source", targetFolder: "Sources", actions: [] }
        );
        expect(changes).toEqual([
            { fieldKey: "apply_template_field_label", before: "Fuente", after: "Source" },
            { fieldKey: "apply_template_field_actions", before: "1", after: "0" },
        ]);
    });

    it("reports an emptied field rather than hiding it", () => {
        const [change] = describeTemplateChanges({ targetFolder: "Sources" }, {});
        expect(change).toEqual({
            fieldKey: "apply_template_field_target",
            before: "Sources",
            after: "",
        });
    });

    it("compares the body and the linked note by presence, not by quoting them", () => {
        const changes = describeTemplateChanges(
            { body: "# old" },
            { body: "# new", satellite: { template: "x" } }
        );
        // The body is present on both sides, so only the linked note appears.
        expect(changes.map((change) => change.fieldKey)).toEqual([
            "apply_template_field_satellite",
        ]);
    });

    it("notices a step becoming the start of the flow", () => {
        const changes = describeTemplateChanges({ root: false }, { root: true });
        expect(changes).toEqual([
            { fieldKey: "apply_template_field_root", before: "", after: "yes" },
        ]);
    });
});
