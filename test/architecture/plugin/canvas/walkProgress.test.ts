import { describe, it, expect } from "@jest/globals";
import {
    flowAdjacency,
    remainingSteps,
} from "architecture/plugin/canvas/walkProgress";

/** A canvas node with only the fields the adjacency cares about. */
function node(id: string, extra: Record<string, unknown> = {}) {
    return { id, type: "text", x: 0, y: 0, width: 10, height: 10, ...extra };
}

function edge(from: string, to: string) {
    return { id: `${from}-${to}`, fromNode: from, toNode: to };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const canvas = (nodes: unknown[], edges: unknown[]) => ({ nodes, edges }) as any;

describe("the wizard can say how many steps are left (#408)", () => {
    it("reads the graph from the canvas edges", () => {
        const adjacency = flowAdjacency(
            canvas([node("a"), node("b"), node("c")], [edge("a", "b"), edge("b", "c")])
        );
        expect(adjacency.get("a")).toEqual(["b"]);
        expect(adjacency.get("b")).toEqual(["c"]);
        expect(adjacency.get("c") ?? []).toEqual([]);
    });

    it("counts the longest remaining path, not the shortest", () => {
        // a → b → c → d  and  a → d : the honest answer is the long way round.
        const adjacency = flowAdjacency(
            canvas(
                [node("a"), node("b"), node("c"), node("d")],
                [edge("a", "b"), edge("b", "c"), edge("c", "d"), edge("a", "d")]
            )
        );
        expect(remainingSteps(adjacency, "a")).toBe(3);
        expect(remainingSteps(adjacency, "b")).toBe(2);
        expect(remainingSteps(adjacency, "d")).toBe(0);
    });

    it("says nothing rather than guessing when the flow loops", () => {
        const adjacency = flowAdjacency(
            canvas([node("a"), node("b")], [edge("a", "b"), edge("b", "a")])
        );
        expect(remainingSteps(adjacency, "a")).toBeUndefined();
    });

    it("says nothing for a node the graph does not contain", () => {
        const adjacency = flowAdjacency(canvas([node("a")], []));
        expect(remainingSteps(adjacency, "ghost")).toBeUndefined();
    });

    it("terminates on a big graph instead of exploring every path", () => {
        // A diamond chain: exponentially many paths, linearly many nodes.
        const nodes = [];
        const edges = [];
        for (let i = 0; i < 60; i++) {
            nodes.push(node(`n${i}`), node(`m${i}`));
            edges.push(edge(`n${i}`, `m${i}`), edge(`m${i}`, `n${i + 1}`), edge(`n${i}`, `n${i + 1}`));
        }
        nodes.push(node("n60"));
        const started = Date.now();
        expect(remainingSteps(flowAdjacency(canvas(nodes, edges)), "n0")).toBe(120);
        expect(Date.now() - started).toBeLessThan(1000);
    });

    it("treats the nodes inside a group as its children, like the wizard does", () => {
        const group = node("g", { type: "group", x: 0, y: 0, width: 100, height: 100 });
        const inside = node("i", { x: 10, y: 10, width: 10, height: 10 });
        const outside = node("o", { x: 500, y: 500, width: 10, height: 10 });
        const adjacency = flowAdjacency(canvas([group, inside, outside], []));
        expect(adjacency.get("g")).toEqual(["i"]);
        expect(remainingSteps(adjacency, "g")).toBe(1);
    });

    it("survives a canvas with nothing in it", () => {
        const adjacency = flowAdjacency(canvas([], []));
        expect(adjacency.size).toBe(0);
        expect(remainingSteps(adjacency, "a")).toBeUndefined();
    });
});
