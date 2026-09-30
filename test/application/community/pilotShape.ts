import { readFileSync } from "fs";
import { parseTemplate } from "application/template/zfTemplate";
import { AI_ACTION_IDS } from "application/community/systemInstall";
import type { ZfTemplate } from "application/template/zfTemplate";

/**
 * Shared assertions for the rebuilt, canvas-native **pilot** systems (#612, Slice B).
 *
 * Each helper returns a list of problems (empty = good), so a test asserts `toEqual([])` and the same
 * checks read across all three pilots (Zettelkasten/PARA/GTD) plus the reference fixture. Pure and
 * Obsidian-free — it only parses the template's canvas JSON and each node's inline `zettelflowConfig`.
 *
 * The three properties that make a system "drawn, not skeletal":
 * - **shape** — real edges, at least one inline `text`/`group` step, exactly one root;
 * - **mechanical on-creation (§XII)** — nothing interpretive is auto-written to the vault;
 * - **offline** — no AI-category action anywhere.
 */

interface InlineStep {
    id: string;
    config: Record<string, unknown>;
}

/** The `onCreation` outputs a shipped system may auto-write: gathered lists, derived metrics, structural facts. */
const MECHANICAL_ONCREATION: ReadonlySet<string> = new Set([
    "find-related", "calculate-maturity", "detect-orphan", "find-contradiction",
    "find-unanswered-question", "extract-claims", "find-sources", "compare-claims",
]);

/** Interpretive proposals — a §XII human verdict, never a silent on-creation write. */
const INTERPRETIVE_ONCREATION: ReadonlySet<string> = new Set(["suggest-link", "suggest-next-move"]);

export function loadPilot(file: string): ZfTemplate {
    return parseTemplate(readFileSync(file, "utf8"));
}

function canvas(template: ZfTemplate): { nodes: unknown[]; edges: unknown[] } {
    try {
        const data = JSON.parse(template.canvas.content) as { nodes?: unknown; edges?: unknown };
        return {
            nodes: Array.isArray(data.nodes) ? data.nodes : [],
            edges: Array.isArray(data.edges) ? data.edges : [],
        };
    } catch {
        return { nodes: [], edges: [] };
    }
}

export function inlineSteps(template: ZfTemplate): InlineStep[] {
    const steps: InlineStep[] = [];
    for (const node of canvas(template).nodes) {
        const n = node as { id?: unknown; type?: unknown; zettelflowConfig?: unknown };
        if ((n.type === "text" || n.type === "group") && typeof n.zettelflowConfig === "string") {
            try {
                steps.push({ id: typeof n.id === "string" ? n.id : "?", config: JSON.parse(n.zettelflowConfig) });
            } catch {
                // An unparseable inline config is the inline-lint guardrail's job (Slice A), not shape's.
            }
        }
    }
    return steps;
}

export function edgeCount(template: ZfTemplate): number {
    return canvas(template).edges.length;
}

function typesOf(list: unknown): string[] {
    if (!Array.isArray(list)) return [];
    return list
        .map((action) => (action as { type?: unknown } | null)?.type)
        .filter((type): type is string => typeof type === "string");
}

export function actionTypes(template: ZfTemplate): string[] {
    return inlineSteps(template).flatMap((step) => typesOf(step.config.actions));
}

export function onCreationTypes(template: ZfTemplate): string[] {
    return inlineSteps(template).flatMap((step) => typesOf(step.config.onCreation));
}

/** Shape: the canvas draws a flow (edges), has inline steps, and has exactly one root. */
export function shapeProblems(template: ZfTemplate): string[] {
    const problems: string[] = [];
    const steps = inlineSteps(template);
    if (edgeCount(template) === 0) problems.push("no edges: the flow is not drawn");
    if (steps.length === 0) problems.push("no inline text/group steps");
    const roots = steps.filter((step) => step.config.root === true).length;
    if (roots !== 1) problems.push(`expected exactly one root, found ${roots}`);
    return problems;
}

/** §XII: every auto on-creation write is mechanical — no interpretive proposal, no AI. */
export function mechanicalOnCreationProblems(template: ZfTemplate): string[] {
    const problems: string[] = [];
    for (const type of onCreationTypes(template)) {
        if (INTERPRETIVE_ONCREATION.has(type)) problems.push(`interpretive on-creation write "${type}" (§XII)`);
        else if (AI_ACTION_IDS.has(type)) problems.push(`AI on-creation write "${type}" (offline rule)`);
        else if (!MECHANICAL_ONCREATION.has(type)) problems.push(`on-creation "${type}" is not on the mechanical allow-list`);
    }
    return problems;
}

/** Offline: no AI-category action anywhere (interactive or on-creation). */
export function aiProblems(template: ZfTemplate): string[] {
    return [...actionTypes(template), ...onCreationTypes(template)]
        .filter((type) => AI_ACTION_IDS.has(type))
        .map((type) => `AI action "${type}" (offline rule)`);
}
