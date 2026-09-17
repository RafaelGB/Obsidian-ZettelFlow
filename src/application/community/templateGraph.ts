import type { CanvasData } from "obsidian/canvas";
import { flowAdjacency } from "architecture/plugin/canvas/walkProgress";
import { canvasEdges, resolveEdgeText } from "zettelkasten/review/canvasEdges";
import type { FlowEdgeShape, FlowShape, FlowStepShape } from "application/notes/flowFindings";
import type { RehearsalFlow, RehearsalStep } from "application/notes/rehearsal";
import type { ZfTemplate } from "application/template/zfTemplate";
import type { StepSettings } from "zettelkasten";

/**
 * A community system, read as a graph **before it is installed** (#438, epic #434).
 *
 * You decided whether to install a system from a name, a paragraph and a screenshot. What it asks,
 * what it writes, where it files the note and whether any of its branches can ever open was only
 * discoverable by installing it and running it on a real note — backwards, for something about to
 * be written into your vault.
 *
 * A `.zftemplate` is already the graph #428 and #430 work on: the canvas JSON plus each step's
 * markdown. This reads it **in memory** — no file is created, and no file is read either, because
 * the step contents travel inside the template. Frontmatter parsing is injected, so this module
 * imports nothing that could reach the vault.
 */

/** The YAML parser the caller lends us (Obsidian's), kept out of this module on purpose. */
export type ParseYaml = (yaml: string) => unknown;

export interface TemplateGraph {
    /** What the rehearsal (#430) walks. */
    rehearsal: RehearsalFlow;
    /** What the review (#428) reads. */
    findings: FlowShape;
}

/** A markdown file split into its frontmatter block and the rest. */
export function splitFrontmatter(markdown: string): { yaml: string; body: string } {
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(markdown);
    if (!match) return { yaml: "", body: markdown };
    return { yaml: match[1], body: markdown.slice(match[0].length) };
}

function asSettings(value: unknown): StepSettings | undefined {
    if (!value || typeof value !== "object") return undefined;
    return value as StepSettings;
}

/** The step file a canvas file-node points at, matched by name wherever the template will land. */
function stepFor(template: ZfTemplate, file: string | undefined) {
    if (!file) return undefined;
    const name = file.split("/").pop();
    return template.steps.find((step) => step.filename === name);
}

export function templateGraph(template: ZfTemplate, parseYaml: ParseYaml): TemplateGraph {
    const data = JSON.parse(template.canvas.content) as CanvasData;

    const settingsOf = new Map<string, StepSettings | undefined>();
    const rehearsalSteps: RehearsalStep[] = [];
    const findingSteps: FlowStepShape[] = [];

    for (const node of data.nodes ?? []) {
        if (node.type === "link") continue;

        let settings: StepSettings | undefined;
        let body = "";
        let frontmatter: Record<string, unknown> = {};
        let isFile = false;
        let missing = false;

        if (node.type === "text" || node.type === "group") {
            const config = (node as { zettelflowConfig?: string }).zettelflowConfig;
            settings = config ? asSettings(parseYaml(config)) : undefined;
            body = settings?.body ?? "";
        } else if (node.type === "file") {
            isFile = true;
            const step = stepFor(template, node.file);
            // A file node pointing at a step the bundle does not carry would break on install.
            missing = !step;
            if (step) {
                const parts = splitFrontmatter(step.content);
                const parsed = parts.yaml ? (parseYaml(parts.yaml) as Record<string, unknown>) : {};
                settings = asSettings(parsed?.zettelFlowSettings);
                frontmatter = Object.fromEntries(
                    Object.entries(parsed ?? {}).filter(([key]) => key !== "zettelFlowSettings")
                );
                body = parts.body;
            }
        }

        settingsOf.set(node.id, settings);
        if (!settings) {
            // A file node the bundle does not carry cannot be walked — but it is exactly what the
            // review exists to say, so it is reported rather than skipped in silence.
            if (isFile) {
                findingSteps.push({
                    id: node.id,
                    kind: "file",
                    ...(node.type === "file" && node.file ? { path: node.file } : {}),
                    missing: true,
                });
            }
            continue;
        }

        const label = settings.label?.trim() || node.id;
        rehearsalSteps.push({
            id: node.id,
            label,
            ...(settings.root ? { root: true } : {}),
            actions: (settings.actions ?? []).map((action) => ({
                type: action.type,
                ...(action.description ? { description: action.description } : {}),
                hasUI: action.hasUI === true,
            })),
            ...(body.trim() ? { template: { body, frontmatter } } : {}),
            ...(settings.satellite ? { satellite: settings.satellite } : {}),
            ...(settings.targetFolder ? { targetFolder: settings.targetFolder } : {}),
            ...(settings.wait ? { wait: settings.wait } : {}),
            ...(settings.exits ? { exits: settings.exits } : {}),
        });

        findingSteps.push({
            id: node.id,
            label: settings.label,
            kind: isFile ? "file" : node.type === "group" ? "group" : "text",
            ...(node.type === "file" && node.file ? { path: node.file } : {}),
            ...(missing ? { missing: true } : {}),
            ...(settings.root ? { root: true } : {}),
            writesKeys: (settings.actions ?? [])
                .map((action) => action as unknown as { key?: string; zone?: string })
                .filter((action) => action.key && action.zone === "frontmatter")
                .map((action) => action.key as string),
            asks: (settings.actions ?? []).filter((action) => action.hasUI).length,
            hasTemplate: Boolean(body.trim()),
            hasTarget: Boolean(settings.targetFolder?.trim()),
        });
    }

    const edges = canvasEdges(data);
    const findingEdges: FlowEdgeShape[] = edges.map((edge) => ({
        id: edge.id,
        fromNode: edge.fromNode,
        toNode: edge.toNode,
        ...resolveEdgeText(edge, settingsOf.get(edge.fromNode)?.exits),
    }));

    return {
        rehearsal: { steps: rehearsalSteps, edges },
        findings: { steps: findingSteps, edges: findingEdges, adjacency: flowAdjacency(data) },
    };
}
