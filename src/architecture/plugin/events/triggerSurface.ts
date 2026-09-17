import type { FlowRole } from "architecture/plugin/canvas/flowRole";

/**
 * Where a trigger can be configured (#436, epic #434) — pure.
 *
 * The step editor offered *when does this run automatically?* on every step of every canvas, and
 * the engine reads a trigger from exactly one place: the **root** of a flow it scans. Every other
 * switch was disconnected — the product said yes and meant no, with no error to read, because
 * nothing failed: the configuration was simply never looked at.
 *
 * The role (#435) is what makes the rule statable. A canvas that is not an event flow has no
 * trigger surface at all; the root of one has the full section; and a trigger that already exists
 * is **never hidden from the person who wrote it**, wherever it sits.
 */

export type TriggerSurface =
    /** The section, as it always was. */
    | "full"
    /** Not the root of this event flow: say why, and offer to make it the start. */
    | "make-root"
    /** A stored trigger that cannot fire here: show it, explain, allow removing it. */
    | "orphan"
    /** Nothing at all. */
    | "none";

export interface TriggerSurfaceInput {
    /** The role of the canvas this step lives on; `unknown` when the step is a note with no canvas. */
    role: FlowRole | "unknown";
    isRoot: boolean;
    hasTrigger: boolean;
}

export function triggerSurface({ role, isRoot, hasTrigger }: TriggerSurfaceInput): TriggerSurface {
    if (role === "event") {
        if (isRoot) return "full";
        return hasTrigger ? "orphan" : "make-root";
    }
    // A step note can be the root of an event flow we cannot see from here: the rule we *can*
    // check is the one the engine also checks, so the offer stays where it might be honoured.
    if (role === "unknown" && isRoot) return "full";
    return hasTrigger ? "orphan" : "none";
}
