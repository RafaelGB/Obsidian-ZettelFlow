/**
 * The binding model (#150): a *binding* wires a workflow-trigger event to a flow, optionally gated by
 * a `zf` condition. Bindings are stored per-flow in the root step's `zettelFlowSettings` frontmatter
 * (maintainer decision OQ-3), so a trigger travels with its flow through the community gallery. The
 * engine builds the live binding set by *scanning* the flows folder — hence `buildBindings` takes the
 * roots discovered per flow rather than a settings array. Pure & Obsidian-free.
 */

import { isWorkflowEvent, type WorkflowEvent } from "./vocabulary";

/**
 * A per-flow trigger, authored in the root step's frontmatter. Additive & optional: a flow with no
 * `trigger` is never event-driven (back-compat, no migration).
 */
export interface WorkflowTrigger {
    /** The event this flow reacts to. */
    event: WorkflowEvent;
    /** Optional `zf` script source; a truthy return fires the binding. Absent = "always". */
    condition?: string;
    /** Disable the trigger without removing it. Absent or `true` = enabled; `false` = off. */
    enabled?: boolean;
}

/** A resolved binding = a flow's trigger plus where it lives (for firing + management UI). */
export interface WorkflowBinding {
    event: WorkflowEvent;
    condition?: string;
    enabled?: boolean;
    /** Vault-relative path of the flow (canvas) the trigger lives on. */
    flowPath: string;
    /** Id of the root node carrying the trigger (for the management list / removal). */
    nodeId?: string;
    /**
     * Vault-relative path of the root step's markdown file, when the root is a file node. Lets the
     * management UI edit/remove the trigger via that file's `zettelFlowSettings` frontmatter.
     * Absent for text/group roots (their config lives in the canvas JSON).
     */
    filePath?: string;
}

/** One flow's contribution to the scan: its path and the triggers on its root node(s). */
export interface FlowTriggerSource {
    flowPath: string;
    roots: { nodeId?: string; filePath?: string; trigger?: WorkflowTrigger }[];
}

/**
 * Build the live binding set from a flow-folder scan. Each root that carries a valid `trigger`
 * becomes one binding; roots without a trigger (or with an unknown event token) contribute nothing.
 */
export function buildBindings(flows: FlowTriggerSource[]): WorkflowBinding[] {
    const bindings: WorkflowBinding[] = [];
    for (const flow of flows) {
        for (const root of flow.roots) {
            const trigger = root.trigger;
            if (!trigger || !isWorkflowEvent(trigger.event)) continue;
            const binding: WorkflowBinding = {
                event: trigger.event,
                flowPath: flow.flowPath,
                nodeId: root.nodeId,
            };
            if (trigger.condition !== undefined) binding.condition = trigger.condition;
            if (trigger.enabled !== undefined) binding.enabled = trigger.enabled;
            if (root.filePath !== undefined) binding.filePath = root.filePath;
            bindings.push(binding);
        }
    }
    return bindings;
}

/** The bindings that should react to `event`: matching event token and not explicitly disabled. */
export function matchBindings(
    event: WorkflowEvent,
    bindings: WorkflowBinding[]
): WorkflowBinding[] {
    return bindings.filter((binding) => binding.event === event && binding.enabled !== false);
}
