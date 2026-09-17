import type { Flow } from "architecture/plugin/canvas";
import { FileService, FrontmatterService, YamlService } from "architecture/plugin";
import type { StepExits } from "application/notes/stepExits";
import type { StepSettings } from "zettelkasten";

/**
 * Where a step's **exits** are kept, and how they are written back (#427, epic #422).
 *
 * The exits belong to the source step, so they live wherever that step's settings already live: in
 * the node's `zettelflowConfig` for a canvas box or group, in the note's frontmatter for a step
 * note. Both doors — the step editor's exits section and the arrow's own popup — write through
 * here, so there is exactly one place that knows the difference.
 */

type ConfigNode = { zettelflowConfig?: string };

/** The step's settings as stored, or `undefined` when the node is not a ZettelFlow step. */
export async function readStepSettings(flow: Flow, nodeId: string): Promise<StepSettings | undefined> {
    const node = flow.data.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return undefined;
    if (node.type === "text" || node.type === "group") {
        return YamlService.instance((node as ConfigNode).zettelflowConfig ?? "").getZettelFlowSettings();
    }
    if (node.type === "file" && node.file?.endsWith(".md")) {
        const file = await FileService.getFile(node.file, false);
        if (!file) return undefined;
        return FrontmatterService.instance(file).getZettelFlowSettings();
    }
    return undefined;
}

/**
 * Persist a step's exits. Returns `false` when the node cannot hold settings (a `.js` script node,
 * an image) — the caller then keeps the old behaviour rather than pretending it saved.
 */
export async function writeStepExits(flow: Flow, nodeId: string, exits: StepExits): Promise<boolean> {
    const node = flow.data.nodes.find((candidate) => candidate.id === nodeId);
    const settings = await readStepSettings(flow, nodeId);
    if (!node || !settings) return false;

    const next: StepSettings = { ...settings };
    // An empty map is the absence of configuration, not an empty object in the file.
    if (Object.keys(exits).length > 0) {
        next.exits = exits;
    } else {
        delete next.exits;
    }

    if (node.type === "text" || node.type === "group") {
        await flow.editTextNode(nodeId, JSON.stringify(next));
        return true;
    }
    if (node.type === "file" && node.file?.endsWith(".md")) {
        const file = await FileService.getFile(node.file, false);
        if (!file) return false;
        await FrontmatterService.instance(file).setZettelFlowSettings(next);
        return true;
    }
    return false;
}
