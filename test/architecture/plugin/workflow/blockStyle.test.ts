import { describe, it, expect } from "@jest/globals";
import { BLOCK_STYLE, styleForNode, styleForEdge } from "architecture/plugin/workflow/blockStyle";
import { WORKFLOW_BLOCK_KINDS, BLOCK_LABEL_KEY } from "architecture/plugin/workflow/blocks";

describe("block-kind → canvas style map (in-canvas legibility)", () => {
    it("maps every block kind to a stable, unique css class + its label key", () => {
        const classes = new Set<string>();
        for (const kind of WORKFLOW_BLOCK_KINDS) {
            const style = BLOCK_STYLE[kind];
            expect(style.cssClass.length).toBeGreaterThan(0);
            expect(style.labelKey).toBe(BLOCK_LABEL_KEY[kind]);
            classes.add(style.cssClass);
        }
        expect(classes.size).toBe(WORKFLOW_BLOCK_KINDS.length); // all distinct
    });

    describe("styleForNode", () => {
        it("styles a WHEN root, a WAIT node, and an ACTION node by kind", () => {
            expect(styleForNode({ root: true, trigger: { event: "note.created" } })).toBe(
                BLOCK_STYLE.when
            );
            expect(styleForNode({ wait: { mode: "confirm" } })).toBe(BLOCK_STYLE.wait);
            expect(styleForNode({})).toBe(BLOCK_STYLE.action);
        });
    });

    describe("styleForEdge", () => {
        it("styles an if: edge as the IF block", () => {
            expect(styleForEdge('if: frontmatter.type === "x"')).toBe(BLOCK_STYLE.if);
            expect(styleForEdge("IF: a === b")).toBe(BLOCK_STYLE.if);
        });

        it("yields no style for a plain (non-conditional) edge", () => {
            expect(styleForEdge("Next")).toBeUndefined();
            expect(styleForEdge(undefined)).toBeUndefined();
        });
    });
});
