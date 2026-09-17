import { describe, it, expect } from "@jest/globals";
import { canvasEdges } from "zettelkasten/review/canvasEdges";

/** A canvas node with only the fields the adjacency cares about. */
const node = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    type: "text",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    ...extra,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const canvas = (nodes: unknown[], edges: unknown[] = []) => ({ nodes, edges }) as any;

describe("a reading walks what the wizard walks (#428, #430)", () => {
    it("follows the arrows between boxes, label and all", () => {
        expect(
            canvasEdges(
                canvas(
                    [node("a"), node("b")],
                    [{ id: "e1", fromNode: "a", toNode: "b", label: "Source" }]
                )
            )
        ).toEqual([{ id: "e1", fromNode: "a", toNode: "b", label: "Source" }]);
    });

    it("enters a group's boxes, which have no arrow at all", () => {
        // A canvas built out of groups is the common shape, and reading `data.edges` alone made it
        // look like a flow with no options: the rehearsal appeared to do nothing.
        expect(
            canvasEdges(
                canvas([
                    node("group", { type: "group", x: 0, y: 0, width: 100, height: 100 }),
                    node("inside", { x: 10, y: 10 }),
                ])
            )
        ).toEqual([{ id: "contains:group:inside", fromNode: "group", toNode: "inside" }]);
    });

    it("ignores an arrow leaving a group, exactly as the engine does", () => {
        const edges = canvasEdges(
            canvas(
                [
                    node("group", { type: "group", x: 0, y: 0, width: 100, height: 100 }),
                    node("inside", { x: 10, y: 10 }),
                    node("far", { x: 500, y: 500 }),
                ],
                [{ id: "e1", fromNode: "group", toNode: "far" }]
            )
        );
        expect(edges.map((edge) => edge.toNode)).toEqual(["inside"]);
    });

    it("hands the raw label over rather than interpreting it", () => {
        // Who resolves the gate and the words is the exits' business (#427), in one place.
        const [edge] = canvasEdges(
            canvas(
                [node("a"), node("b")],
                [{ id: "e1", fromNode: "a", toNode: "b", label: 'if: frontmatter.x === "y"' }]
            )
        );
        expect(edge.label).toBe('if: frontmatter.x === "y"');
    });

    it("says nothing about an arrow with no label", () => {
        const [edge] = canvasEdges(
            canvas([node("a"), node("b")], [{ id: "e1", fromNode: "a", toNode: "b" }])
        );
        expect("label" in edge).toBe(false);
    });
});
