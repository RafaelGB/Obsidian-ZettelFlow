import { describe, it, expect, jest } from "@jest/globals";
import { lowerWhenToTrigger } from "architecture/plugin/workflow/lowering";
import { buildBindings, type FlowTriggerSource } from "architecture/plugin/events/bindings";
import { dispatchEvent, DispatchResult, type DispatchDeps } from "architecture/plugin/events/dispatch";
import { ThrottleGate } from "architecture/plugin/events/throttle";
import { CascadeGuard } from "architecture/plugin/events/loopGuard";
import type { WorkflowEventPayload } from "architecture/plugin/events/vocabulary";

const payload: WorkflowEventPayload = { event: "note.created", notePath: "notes/a.md" };

/** Lower a WHEN block, then build the #150 binding set exactly as the engine's flow scan does. */
function bindingsFromWhen(condition?: string) {
    const trigger = lowerWhenToTrigger({ event: "note.created", condition });
    const flows: FlowTriggerSource[] = [{ flowPath: "flows/f.canvas", roots: [{ nodeId: "n1", trigger }] }];
    return buildBindings(flows);
}

type RunWorkflow = DispatchDeps["runWorkflow"];

function deps(overrides: Partial<DispatchDeps> = {}): DispatchDeps {
    return {
        enabled: () => true,
        bindings: bindingsFromWhen,
        selfWriteState: () => ({ frozen: false }),
        throttle: new ThrottleGate(),
        cascade: new CascadeGuard(),
        runScript: jest.fn(async () => true),
        runWorkflow: jest.fn<RunWorkflow>(),
        now: () => 0,
        ...overrides,
    };
}

describe("lowerWhenToTrigger — a WHEN block IS a #150 trigger (AC-2, AC-5, one execution path)", () => {
    it("lowers to the exact WorkflowTrigger shape", () => {
        expect(lowerWhenToTrigger({ event: "note.created" })).toEqual({ event: "note.created" });
        expect(lowerWhenToTrigger({ event: "tag.added", condition: "return true", enabled: false })).toEqual({
            event: "tag.added",
            condition: "return true",
            enabled: false,
        });
    });

    it("fires once through the UNMODIFIED #150 buildBindings → dispatchEvent", async () => {
        const runWorkflow = jest.fn<RunWorkflow>();
        const result = await dispatchEvent(payload, deps({ runWorkflow }));
        expect(result).toEqual([DispatchResult.FIRED]);
        expect(runWorkflow).toHaveBeenCalledTimes(1);
    });

    it("does not fire when event-driven execution is OFF (safety inherited from #150)", async () => {
        const runWorkflow = jest.fn<RunWorkflow>();
        const result = await dispatchEvent(payload, deps({ enabled: () => false, runWorkflow }));
        expect(result).toEqual([DispatchResult.SKIP_DISABLED]);
        expect(runWorkflow).not.toHaveBeenCalled();
    });

    it("inherits the #150 throttle: a burst collapses to one FIRED", async () => {
        const throttle = new ThrottleGate();
        const runWorkflow = jest.fn<RunWorkflow>();
        let now = 0;
        const shared = deps({ throttle, runWorkflow, now: () => now });
        const first = await dispatchEvent(payload, shared);
        now = 100;
        const second = await dispatchEvent(payload, shared);
        expect(first).toEqual([DispatchResult.FIRED]);
        expect(second).toEqual([DispatchResult.SKIP_THROTTLED]);
    });

    it("inherits the #150 loop guard: a self-write is suppressed", async () => {
        const runWorkflow = jest.fn<RunWorkflow>();
        const result = await dispatchEvent(
            payload,
            deps({ selfWriteState: () => ({ frozen: true }), runWorkflow })
        );
        expect(result).toEqual([DispatchResult.SKIP_SELF_WRITE]);
        expect(runWorkflow).not.toHaveBeenCalled();
    });
});
