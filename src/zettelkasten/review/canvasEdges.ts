import type { CanvasData } from "obsidian/canvas";
import { flowAdjacency } from "architecture/plugin/canvas/walkProgress";
import { describeOption } from "application/notes/optionDescription";
import { parseEdgeCondition } from "application/notes/conditionEvaluator";
import type { StepExits } from "application/notes/stepExits";

/**
 * The arrows a flow can actually take (#428/#430, epic #422) — as the wizard takes them.
 *
 * `FlowImpl.childrensOf` follows outgoing edges for a normal node and **geometric containment**
 * for a group, and ignores an edge that leaves a group. `flowAdjacency` (#408) already mirrors
 * that; this pairs it back with the canvas edge so a reading can see the label too.
 *
 * Reading `data.edges` alone made a group-rooted canvas — the common shape — look like a flow with
 * no options at all, which is how the rehearsal appeared to do nothing.
 */

export interface CanvasEdgeShape {
    /** The canvas edge id, or a synthetic one for containment (a group's child has no arrow). */
    id: string;
    fromNode: string;
    toNode: string;
    /** The raw label: gate and words together, exactly as stored. Absent for containment. */
    label?: string;
}

export function canvasEdges(data: CanvasData): CanvasEdgeShape[] {
    const groups = new Set(
        (data.nodes ?? []).filter((node) => node.type === "group").map((node) => node.id)
    );
    const edges: CanvasEdgeShape[] = [];

    for (const [fromNode, children] of flowAdjacency(data)) {
        for (const toNode of children) {
            // A group's children are inside it; there is no arrow to read a label from.
            const canvasEdge = groups.has(fromNode)
                ? undefined
                : (data.edges ?? []).find(
                      (candidate) =>
                          candidate.fromNode === fromNode && candidate.toNode === toNode
                  );
            edges.push({
                id: canvasEdge?.id ?? `contains:${fromNode}:${toNode}`,
                fromNode,
                toNode,
                ...(canvasEdge?.label ? { label: canvasEdge.label } : {}),
            });
        }
    }

    return edges;
}

/**
 * What an arrow says and when it is open, from the step's exits (#427) with its label as the
 * fallback. One resolution, shared by the review of a flow in the vault and of a system that is
 * not installed yet (#438).
 */
export function resolveEdgeText(
    edge: CanvasEdgeShape,
    exits: StepExits | undefined
): { when?: string; says?: string } {
    const exit = exits?.[edge.id];
    const when = exit?.when ?? parseEdgeCondition(edge.label);
    const says = exit?.says ?? describeOption(edge.label);
    return { ...(when ? { when } : {}), ...(says ? { says } : {}) };
}
