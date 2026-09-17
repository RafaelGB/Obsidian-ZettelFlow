import type { Flow } from "architecture/plugin/canvas";
import { flowAdjacency } from "architecture/plugin/canvas/walkProgress";
import { ObsidianApi } from "architecture";
import { describeOption } from "application/notes/optionDescription";
import { parseEdgeCondition } from "application/notes/conditionEvaluator";
import { canvasEdges } from "./canvasEdges";
import type { FlowEdgeShape, FlowShape, FlowStepShape } from "application/notes/flowFindings";
import type { StepSettings } from "zettelkasten";
import { readStepSettings } from "zettelkasten/exits/exitStore";

/**
 * A canvas, read into the shape the pure finder wants (#428, epic #422).
 *
 * This is the impure half of *review this flow*: it resolves each node's settings, asks the vault
 * whether a file step's note still exists, and hands `flowFindings` a plain graph. It writes
 * nothing — the review is a reading.
 */

/** The frontmatter keys a step's actions declare — what the flow itself writes. */
function writtenKeys(settings: StepSettings | undefined): string[] {
    const keys: string[] = [];
    for (const action of settings?.actions ?? []) {
        const { key, zone } = action as unknown as { key?: string; zone?: string };
        if (key && zone === "frontmatter") keys.push(key);
    }
    return keys;
}

export async function readFlowShape(flow: Flow): Promise<FlowShape> {
    const steps: FlowStepShape[] = [];
    const settingsOf = new Map<string, StepSettings | undefined>();

    for (const node of flow.data.nodes ?? []) {
        if (node.type === "link") continue;
        const settings = await readStepSettings(flow, node.id);
        settingsOf.set(node.id, settings);
        const isFile = node.type === "file";
        const path = isFile ? node.file : undefined;
        const file = path ? ObsidianApi.vault().getFileByPath(path) : null;
        const isScript = Boolean(path?.endsWith(".js"));

        steps.push({
            id: node.id,
            label: settings?.label,
            kind: isScript ? "script" : node.type === "text" || node.type === "group" || isFile ? node.type : "unknown",
            ...(path ? { path } : {}),
            // A file step whose note is gone throws `FatalError` mid-wizard — the one finding that
            // is marked on the canvas without opening the panel.
            ...(isFile && !file ? { missing: true } : {}),
            ...(settings?.root ? { root: true } : {}),
            writesKeys: writtenKeys(settings),
            asks: (settings?.actions ?? []).filter((action) => action.hasUI).length,
            // A step note is its own template; an inline box carries one only if it was given one.
            hasTemplate: isFile ? !isScript : Boolean(settings?.body?.trim()),
            hasTarget: Boolean(settings?.targetFolder?.trim()),
        });
    }

    // The same graph the wizard walks, so a group's children are options too (#428).
    const edges: FlowEdgeShape[] = canvasEdges(flow.data).map((edge) => {
        // The step owns its exits (#427); an unconfigured arrow still speaks through its label.
        const exit = settingsOf.get(edge.fromNode)?.exits?.[edge.id];
        return {
            id: edge.id,
            fromNode: edge.fromNode,
            toNode: edge.toNode,
            ...(exit?.when ?? parseEdgeCondition(edge.label)
                ? { when: exit?.when ?? parseEdgeCondition(edge.label) }
                : {}),
            ...(exit?.says ?? describeOption(edge.label)
                ? { says: exit?.says ?? describeOption(edge.label) }
                : {}),
        };
    });

    return { steps, edges, adjacency: flowAdjacency(flow.data) };
}
