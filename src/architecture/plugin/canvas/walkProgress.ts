import { CanvasData, CanvasNodeData } from "obsidian/canvas";
import { findDirectChildren } from "./shared/Geometry";

/**
 * How much of a flow is left to walk (#408, epic #405).
 *
 * The wizard used to show `"{n} steps completed"` — a counter with no denominator, which answers a
 * question nobody asked. The flow graph is known, so the honest answer is derivable: the **longest**
 * remaining path from the node you are standing on. Long, not short, because a shorter estimate would
 * read as a promise the flow cannot keep.
 *
 * Pure and Obsidian-free (only canvas *types* are imported): the adjacency is built once from the
 * canvas data and the depth is a plain graph walk, so both are unit-testable without an app.
 */

/**
 * Children per node, mirroring how the wizard itself traverses: outgoing edges for a normal node, and
 * geometric containment for a group (`FlowImpl.childrensOf` does exactly this).
 */
export function flowAdjacency(data: CanvasData): Map<string, string[]> {
    const adjacency = new Map<string, string[]>();
    const nodes: CanvasNodeData[] = data.nodes ?? [];
    const groups = new Set(nodes.filter((node) => node.type === "group").map((node) => node.id));

    for (const node of nodes) {
        if (groups.has(node.id)) {
            adjacency.set(
                node.id,
                findDirectChildren(node, nodes).map((child: CanvasNodeData) => child.id)
            );
        } else {
            adjacency.set(node.id, []);
        }
    }

    for (const edge of data.edges ?? []) {
        if (groups.has(edge.fromNode)) continue;
        const children = adjacency.get(edge.fromNode);
        if (children) children.push(edge.toNode);
        else adjacency.set(edge.fromNode, [edge.toNode]);
    }

    return adjacency;
}

/**
 * Steps left from `from`, following the longest path. `undefined` means *"no honest answer"*: the node
 * is not in the graph, or a cycle is reachable from it — in which case the wizard shows the position
 * alone rather than a number it cannot stand behind.
 *
 * Memoised per node, so a graph with exponentially many paths still costs one visit per node.
 */
export function remainingSteps(
    adjacency: Map<string, string[]>,
    from: string
): number | undefined {
    if (!adjacency.has(from)) return undefined;

    const depth = new Map<string, number>();
    const onStack = new Set<string>();
    let cyclic = false;

    const visit = (nodeId: string): number => {
        const cached = depth.get(nodeId);
        if (cached !== undefined) return cached;
        if (onStack.has(nodeId)) {
            cyclic = true;
            return 0;
        }
        onStack.add(nodeId);
        let longest = 0;
        for (const child of adjacency.get(nodeId) ?? []) {
            if (!adjacency.has(child)) continue;
            longest = Math.max(longest, 1 + visit(child));
            if (cyclic) break;
        }
        onStack.delete(nodeId);
        depth.set(nodeId, longest);
        return longest;
    };

    const result = visit(from);
    return cyclic ? undefined : result;
}
