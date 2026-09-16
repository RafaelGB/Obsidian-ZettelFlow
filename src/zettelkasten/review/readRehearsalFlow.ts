import type { Flow } from "architecture/plugin/canvas";
import { FileService, FrontmatterService } from "architecture/plugin";
import { describeOption } from "application/notes/optionDescription";
import type { RehearsalEdge, RehearsalFlow, RehearsalStep } from "application/notes/rehearsal";
import type { PreviewTemplate } from "application/notes/previewAssembly";
import type { StepSettings } from "zettelkasten";
import { readStepSettings } from "./../exits/exitStore";

/**
 * A canvas, read into the shape the rehearsal walks (#430, epic #422).
 *
 * The impure half of *rehearse the flow*: it resolves each node's settings and **reads** the
 * templates a step would contribute — a step note's own body, an inline box's stored one. Reading
 * is all it does; the walk itself cannot write, and its guardrail test proves it.
 */

/** The template a step contributes: a step note is its own, an inline box carries one (#426). */
async function templateOf(
    flow: Flow,
    nodeId: string,
    settings: StepSettings | undefined
): Promise<PreviewTemplate | undefined> {
    const node = flow.data.nodes.find((candidate) => candidate.id === nodeId);
    if (node?.type === "file" && node.file?.endsWith(".md")) {
        const file = await FileService.getFile(node.file, false);
        if (!file) return undefined;
        const service = FrontmatterService.instance(file);
        return { body: await service.getContent(), frontmatter: service.getFrontmatter() };
    }
    const body = settings?.body?.trim();
    return body ? { body: settings?.body ?? "", frontmatter: {} } : undefined;
}

export async function readRehearsalFlow(flow: Flow): Promise<RehearsalFlow> {
    const steps: RehearsalStep[] = [];
    const settingsOf = new Map<string, StepSettings | undefined>();

    for (const node of flow.data.nodes ?? []) {
        if (node.type === "link") continue;
        const settings = await readStepSettings(flow, node.id);
        settingsOf.set(node.id, settings);
        if (!settings) continue;

        const template = await templateOf(flow, node.id, settings);
        steps.push({
            id: node.id,
            label: settings.label?.trim() || node.id,
            ...(settings.root ? { root: true } : {}),
            actions: (settings.actions ?? []).map((action) => ({
                type: action.type,
                ...(action.description ? { description: action.description } : {}),
                hasUI: action.hasUI === true,
            })),
            ...(template ? { template } : {}),
            ...(settings.satellite ? { satellite: settings.satellite } : {}),
            ...(settings.targetFolder ? { targetFolder: settings.targetFolder } : {}),
            ...(settings.wait ? { wait: settings.wait } : {}),
            ...(settings.exits ? { exits: settings.exits } : {}),
        });
    }

    const edges: RehearsalEdge[] = (flow.data.edges ?? []).map((edge) => {
        const exit = settingsOf.get(edge.fromNode)?.exits?.[edge.id];
        const says = exit?.says ?? describeOption(edge.label);
        return {
            id: edge.id,
            fromNode: edge.fromNode,
            toNode: edge.toNode,
            ...(says ? { says } : {}),
        };
    });

    return { steps, edges };
}
