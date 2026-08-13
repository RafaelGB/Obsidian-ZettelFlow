/**
 * WHEN → #150 trigger lowering (#151). A WHEN block does not introduce a new runtime — it *is* the
 * #150 `WorkflowTrigger` stored in the root step's `zettelFlowSettings.trigger`. This module is the
 * identity map from the authoring form to that exact shape, so a visually-authored WHEN flows through
 * the **unmodified** #150 engine (`buildBindings` → `dispatchEvent`) — one execution path, one set of
 * safety guards (OFF-by-default, throttle, loop guard). Pure & Obsidian-free.
 */

import type { WorkflowEvent, WorkflowTrigger } from "../events";

/** The authoring form of a WHEN block (what the step-builder trigger editor collects). */
export interface WhenAuthoring {
    event: WorkflowEvent;
    /** Optional `zf` condition (the advanced gate); absent = always. */
    condition?: string;
    /** Optional explicit enable/disable; absent = enabled. */
    enabled?: boolean;
}

/** Map a WHEN authoring form onto the exact #150 `WorkflowTrigger` shape (omitting absent fields). */
export function lowerWhenToTrigger(when: WhenAuthoring): WorkflowTrigger {
    const trigger: WorkflowTrigger = { event: when.event };
    if (when.condition !== undefined) trigger.condition = when.condition;
    if (when.enabled !== undefined) trigger.enabled = when.enabled;
    return trigger;
}
