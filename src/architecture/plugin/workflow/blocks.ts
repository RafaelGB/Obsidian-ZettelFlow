/**
 * The closed four-kind vocabulary of the visual workflow language (#151): a workflow reads as
 * **WHEN** (a trigger) → **IF** (a condition) → **ACTION** (a step) → **WAIT** (a human pause). The
 * kinds are not new runtime concepts — they *name* primitives that already run (WHEN = the #150
 * trigger, IF = a #119 conditional edge, ACTION = a Step node) plus the one new primitive, WAIT.
 * This module is the naming/legibility layer; it is pure & Obsidian-free.
 */

import type { WorkflowTrigger } from "../events";

/** The four block kinds. IF is an *edge*; the other three are *nodes*. */
export type WorkflowBlockKind = "when" | "if" | "action" | "wait";

/** The four kinds in canonical (reading) order. */
export const WORKFLOW_BLOCK_KINDS: readonly WorkflowBlockKind[] = [
    "when",
    "if",
    "action",
    "wait",
] as const;

export function isWorkflowBlockKind(value: unknown): value is WorkflowBlockKind {
    return typeof value === "string" && (WORKFLOW_BLOCK_KINDS as readonly string[]).includes(value);
}

/** i18n key of each kind's sentence-case label (also used as its in-canvas annotation). */
export const BLOCK_LABEL_KEY = {
    when: "workflow_block_when_label",
    if: "workflow_block_if_label",
    action: "workflow_block_action_label",
    wait: "workflow_block_wait_label",
} as const satisfies Record<WorkflowBlockKind, string>;

/**
 * The block-relevant fields of a step/node's settings (a structural subset). `wait` is typed
 * `unknown` here — the classifier only truthiness-checks it, so this stays decoupled from `wait.ts`.
 */
export interface NodeBlockShape {
    root?: boolean;
    trigger?: WorkflowTrigger;
    wait?: unknown;
}

/**
 * Classify a canvas node into its block kind for legibility. A **root node carrying a trigger** is a
 * WHEN; a node carrying a **wait** marker is a WAIT; everything else (including a manual root with no
 * trigger) is an ACTION. Never returns `"if"` — IF lives on edges, classified separately.
 */
export function classifyNodeBlock(node: NodeBlockShape): WorkflowBlockKind {
    if (node.root && node.trigger) return "when";
    if (node.wait) return "wait";
    return "action";
}
