/* eslint-disable @typescript-eslint/no-explicit-any */
import type { StaticTemplateOptions } from "config";
import type { ZfTemplate } from "application/template/zfTemplate";

/**
 * The Systems room's fixtures (#799): a catalog row as `docs/main_template.json` carries one, and
 * small `.zftemplate`s drawn from inline canvas boxes — a branching method, a single note, and one
 * that carries a script.
 */
export function entry(over: Partial<StaticTemplateOptions> & { title: string }): StaticTemplateOptions {
    return {
        id: over.title,
        ref: `/docs/systems/${over.title.toLowerCase().replace(/\s+/g, "-")}.zftemplate`,
        description: `${over.title} described. A second sentence.`,
        author: "ZettelFlow",
        template_type: "system",
        ...over,
    };
}

interface Box {
    id: string;
    label: string;
    root?: boolean;
    color?: string;
    x?: number;
    y?: number;
    actions?: Record<string, unknown>[];
    exits?: Record<string, { says?: string; when?: string }>;
}

function box(spec: Box, index: number): Record<string, unknown> {
    return {
        id: spec.id,
        type: "text",
        text: spec.label,
        x: spec.x ?? index * 400,
        y: spec.y ?? 0,
        width: 340,
        height: 250,
        ...(spec.color ? { color: spec.color } : {}),
        zettelflowConfig: JSON.stringify({
            ...(spec.root ? { root: true } : {}),
            label: spec.label,
            phase: "CAPTURE",
            ...(spec.exits ? { exits: spec.exits } : {}),
            actions: spec.actions ?? [{ type: "prompt", id: `${spec.id}-title`, hasUI: true, label: "Title", key: "title", zone: "context" }],
        }),
    };
}

export function inlineTemplate(name: string, boxes: Box[], edges: [string, string, string, string?][]): ZfTemplate {
    const canvas = {
        nodes: boxes.map(box),
        edges: edges.map(([id, fromNode, toNode, label]) => ({ id, fromNode, toNode, fromSide: "right", toSide: "left", ...(label ? { label } : {}) })),
    };
    return {
        zfVersion: "1.0",
        name,
        description: `${name}, drawn as a flow. Offline, no AI.`,
        author: "ZettelFlow",
        canvas: { filename: `${name}.canvas`, content: JSON.stringify(canvas) },
        steps: [],
    };
}

/** Capture → three notes: four steps, one branch point. */
export function branching(name = "Zettelkasten v2"): ZfTemplate {
    return inlineTemplate(
        name,
        [
            {
                id: "cap",
                label: "Capture a Zettel",
                root: true,
                color: "1",
                actions: [
                    { type: "prompt", id: "t", hasUI: true, label: "Title", key: "title", zone: "context" },
                    { type: "selector", id: "k", hasUI: true, label: "What kind of note is this?", options: [["f", "Fleeting"], ["p", "Permanent"]], key: "kind", zone: "frontmatter" },
                ],
            },
            { id: "fleeting", label: "Fleeting note", color: "1", y: -300 },
            { id: "literature", label: "Literature note", color: "3" },
            { id: "permanent", label: "Permanent note", color: "#ff0000", y: 300 },
        ],
        [
            ["e1", "cap", "fleeting", "A fleeting thought"],
            ["e2", "cap", "literature", "From a source"],
            ["e3", "cap", "permanent", "My own idea"],
        ]
    );
}

/** One inline box and no root: a single note, done well. */
export function single(name = "Meeting notes"): ZfTemplate {
    return inlineTemplate(name, [{ id: "only", label: name, color: "5" }], []);
}

/** A system whose one step runs a script (#353). */
export function scripted(name = "Weekly focus"): ZfTemplate {
    return {
        zfVersion: "1.0",
        name,
        description: "Pick one idea. Uses the scripting API.",
        author: "ZettelFlow",
        canvas: {
            filename: `${name}.canvas`,
            content: JSON.stringify({ nodes: [{ id: "n-0", type: "file", file: "Weekly focus.md", x: 0, y: 0, width: 350, height: 260 }], edges: [] }),
        },
        steps: [
            {
                filename: "Weekly focus.md",
                content: [
                    "---",
                    "zettelFlowSettings:",
                    "  root: true",
                    "  label: \"Weekly focus\"",
                    "  actions:",
                    "    - type: script",
                    "      id: \"s1\"",
                    "      code: |",
                    "        return 1;",
                    "---",
                    "Body",
                ].join("\n"),
            },
        ],
    };
}

/** JSON first (what an inline box stores), then a small YAML reader for the scripted step. */
export function parseYamlForTests(yaml: string): any {
    try {
        return JSON.parse(yaml);
    } catch {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const jsYaml = require("js-yaml") as { load(text: string): unknown };
        return jsYaml.load(yaml);
    }
}

/** The real systems' shape: the exits are gated on the answer to the step's question (#427). */
export function gated(name = "Gated"): ZfTemplate {
    return inlineTemplate(
        name,
        [
            {
                id: "cap",
                label: "Capture",
                root: true,
                exits: {
                    g1: { says: "A fleeting thought", when: 'frontmatter.kind === "f"' },
                    g2: { says: "From a source", when: 'frontmatter.kind === "s"' },
                },
            },
            { id: "fleeting", label: "Fleeting note", y: -300 },
            { id: "source", label: "Literature note" },
        ],
        [
            ["g1", "cap", "fleeting"],
            ["g2", "cap", "source"],
        ]
    );
}