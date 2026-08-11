import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { log } from "architecture";
import { dispatchEvent, DispatchResult, type DispatchDeps } from "architecture/plugin/events/dispatch";
import { ThrottleGate } from "architecture/plugin/events/throttle";
import { CascadeGuard } from "architecture/plugin/events/loopGuard";
import type { WorkflowBinding } from "architecture/plugin/events/bindings";
import type { WorkflowEventPayload } from "architecture/plugin/events/vocabulary";

const payload: WorkflowEventPayload = { event: "note.created", notePath: "notes/a.md" };
const binding: WorkflowBinding = { event: "note.created", flowPath: "flows/f.canvas", nodeId: "n1" };

type RunWorkflow = DispatchDeps["runWorkflow"];

function deps(overrides: Partial<DispatchDeps> = {}): DispatchDeps {
    return {
        enabled: () => true,
        bindings: () => [binding],
        selfWriteState: () => ({ frozen: false }),
        throttle: new ThrottleGate(),
        cascade: new CascadeGuard(),
        runScript: jest.fn(async () => true),
        runWorkflow: jest.fn<RunWorkflow>(),
        now: () => 0,
        ...overrides,
    };
}

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

describe("dispatchEvent — the event pipeline (AC-1, AC-2, AC-3, AC-5, AC-6, AC-10)", () => {
    it("fires the matching workflow exactly once and reports FIRED + log.info (AC-1, AC-10)", async () => {
        const info = jest.spyOn(log, "info");
        const runWorkflow = jest.fn<RunWorkflow>();
        const result = await dispatchEvent(payload, deps({ runWorkflow }));
        expect(result).toEqual([DispatchResult.FIRED]);
        expect(runWorkflow).toHaveBeenCalledTimes(1);
        expect(runWorkflow).toHaveBeenCalledWith(binding, payload);
        expect(info).toHaveBeenCalled();
    });

    it("does nothing when event-driven execution is disabled (AC-3)", async () => {
        for (const event of ["note.created", "note.modified", "property.changed", "tag.added"] as const) {
            const runWorkflow = jest.fn<RunWorkflow>();
            const result = await dispatchEvent(
                { event, notePath: "notes/a.md" },
                deps({ enabled: () => false, runWorkflow })
            );
            expect(result).toEqual([DispatchResult.SKIP_DISABLED]);
            expect(runWorkflow).not.toHaveBeenCalled();
        }
    });

    it("reports SKIP_NO_MATCH when no binding matches the event", async () => {
        const runWorkflow = jest.fn<RunWorkflow>();
        const result = await dispatchEvent(
            { event: "tag.added", notePath: "notes/a.md" },
            deps({ runWorkflow })
        );
        expect(result).toEqual([DispatchResult.SKIP_NO_MATCH]);
        expect(runWorkflow).not.toHaveBeenCalled();
    });

    it("skips (SKIP_CONDITION) when the binding's condition is falsy, and logs (AC-2, AC-10)", async () => {
        const debug = jest.spyOn(log, "debug");
        const runWorkflow = jest.fn<RunWorkflow>();
        const conditioned: WorkflowBinding = { ...binding, condition: "return false" };
        const result = await dispatchEvent(
            payload,
            deps({
                bindings: () => [conditioned],
                runScript: jest.fn(async () => false),
                runWorkflow,
            })
        );
        expect(result).toEqual([DispatchResult.SKIP_CONDITION]);
        expect(runWorkflow).not.toHaveBeenCalled();
        expect(debug).toHaveBeenCalled();
    });

    it("suppresses a self-write (SKIP_SELF_WRITE) so a workflow's own write can't loop (AC-5)", async () => {
        const runWorkflow = jest.fn<RunWorkflow>();
        const result = await dispatchEvent(
            payload,
            deps({ selfWriteState: () => ({ frozen: true }), runWorkflow })
        );
        expect(result).toEqual([DispatchResult.SKIP_SELF_WRITE]);
        expect(runWorkflow).not.toHaveBeenCalled();
    });

    it("collapses a burst: one FIRED then SKIP_THROTTLED for the same binding+note (AC-6)", async () => {
        const throttle = new ThrottleGate();
        const runWorkflow = jest.fn<RunWorkflow>();
        let now = 0;
        const shared = deps({ throttle, runWorkflow, now: () => now });
        const first = await dispatchEvent(payload, shared);
        now = 100;
        const second = await dispatchEvent(payload, shared);
        expect(first).toEqual([DispatchResult.FIRED]);
        expect(second).toEqual([DispatchResult.SKIP_THROTTLED]);
        expect(runWorkflow).toHaveBeenCalledTimes(1);
    });

    it("fires two distinct flows bound to the same event and note", async () => {
        const a: WorkflowBinding = { event: "note.created", flowPath: "flows/a.canvas", nodeId: "1" };
        const b: WorkflowBinding = { event: "note.created", flowPath: "flows/b.canvas", nodeId: "1" };
        const runWorkflow = jest.fn<RunWorkflow>();
        const result = await dispatchEvent(payload, deps({ bindings: () => [a, b], runWorkflow }));
        expect(result).toEqual([DispatchResult.FIRED, DispatchResult.FIRED]);
        expect(runWorkflow).toHaveBeenCalledTimes(2);
    });
});
