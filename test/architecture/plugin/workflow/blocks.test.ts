import { describe, it, expect } from "@jest/globals";
import {
    WORKFLOW_BLOCK_KINDS,
    isWorkflowBlockKind,
    classifyNodeBlock,
    BLOCK_LABEL_KEY,
} from "architecture/plugin/workflow/blocks";

describe("workflow block vocabulary (FR-1)", () => {
    it("WORKFLOW_BLOCK_KINDS is exactly the four closed kinds in canonical order", () => {
        expect([...WORKFLOW_BLOCK_KINDS]).toEqual(["when", "if", "action", "wait"]);
    });

    it("isWorkflowBlockKind accepts the four kinds and rejects junk", () => {
        for (const kind of WORKFLOW_BLOCK_KINDS) expect(isWorkflowBlockKind(kind)).toBe(true);
        for (const junk of ["", "step", "trigger", 1, null, undefined, {}]) {
            expect(isWorkflowBlockKind(junk)).toBe(false);
        }
    });

    it("BLOCK_LABEL_KEY has a non-empty i18n key for every kind", () => {
        for (const kind of WORKFLOW_BLOCK_KINDS) {
            expect(typeof BLOCK_LABEL_KEY[kind]).toBe("string");
            expect(BLOCK_LABEL_KEY[kind].length).toBeGreaterThan(0);
        }
    });

    describe("classifyNodeBlock", () => {
        it("classifies a root node with a trigger as WHEN", () => {
            expect(classifyNodeBlock({ root: true, trigger: { event: "note.created" } })).toBe(
                "when"
            );
        });

        it("classifies a node carrying a wait marker as WAIT", () => {
            expect(classifyNodeBlock({ wait: { mode: "confirm" } })).toBe("wait");
        });

        it("classifies an ordinary step node as ACTION", () => {
            expect(classifyNodeBlock({ root: false })).toBe("action");
            expect(classifyNodeBlock({})).toBe("action");
        });

        it("a root without a trigger is just an ACTION (a manual root)", () => {
            expect(classifyNodeBlock({ root: true })).toBe("action");
        });
    });
});
