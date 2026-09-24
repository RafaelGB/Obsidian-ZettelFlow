import { describe, it, expect, jest } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { dispatchEvent, DispatchResult, type DispatchDeps } from "architecture/plugin/events/dispatch";
import { ThrottleGate } from "architecture/plugin/events/throttle";
import { CascadeGuard } from "architecture/plugin/events/loopGuard";
import {
    REVIEW_DUE_DAY_MS,
    reviewDuePayload,
    reviewDueThrottleKey,
    wantsReviewDue,
} from "architecture/plugin/events/reviewDue";
import type { WorkflowBinding } from "architecture/plugin/events/bindings";

// test/architecture/plugin/events → 4 ups → repo root
const ROOT = join(__dirname, "..", "..", "..", "..");
const ENGINE = readFileSync(join(ROOT, "src/architecture/plugin/events/WorkflowEventEngine.ts"), "utf8");

const binding: WorkflowBinding = { event: "review.due", flowPath: "flows/review.canvas", nodeId: "n1" };
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

/**
 * `review.due` stops being reserved (#563, epic #558).
 *
 * It was one of four tokens deferred in #150 and it is the first one to mean something. The point
 * of wiring it into the **existing** pipeline is that it needs no special case: a flow binds to it
 * the way it binds to `note.created`, and every gate that already exists applies.
 */
describe("a claim coming back is an ordinary event (#563)", () => {
    it("fires a flow bound to it, through the pipeline every other event uses", async () => {
        const runWorkflow = jest.fn<RunWorkflow>();
        const payload = reviewDuePayload("Notes/a.md");
        expect(payload).toEqual({ event: "review.due", notePath: "Notes/a.md" });

        const result = await dispatchEvent(payload, deps({ runWorkflow }));
        expect(result).toEqual([DispatchResult.FIRED]);
        expect(runWorkflow).toHaveBeenCalledTimes(1);
    });

    it("evaluates a binding's condition on the way, like any other event", async () => {
        const runScript = jest.fn(async () => false);
        const runWorkflow = jest.fn<RunWorkflow>();
        const conditional: WorkflowBinding = { ...binding, condition: "return false" };
        const result = await dispatchEvent(
            reviewDuePayload("Notes/a.md"),
            deps({ bindings: () => [conditional], runScript, runWorkflow })
        );
        expect(result).toEqual([DispatchResult.SKIP_CONDITION]);
        expect(runWorkflow).not.toHaveBeenCalled();
    });

    it("comes back once a day, per note", () => {
        const gate = new ThrottleGate(REVIEW_DUE_DAY_MS);
        const key = reviewDueThrottleKey("Notes/a.md");
        const morning = 1_700_000_000_000;
        expect(gate.shouldFire(key, morning)).toBe(true);
        expect(gate.shouldFire(key, morning + 23 * 3_600_000)).toBe(false);
        expect(gate.shouldFire(key, morning + REVIEW_DUE_DAY_MS)).toBe(true);
        // Per note, not per vault: another claim is another day of its own.
        expect(gate.shouldFire(reviewDueThrottleKey("Notes/b.md"), morning + 1)).toBe(true);
    });

    it("does nothing at all when no flow is bound to it", () => {
        expect(wantsReviewDue([])).toBe(false);
        expect(wantsReviewDue([{ event: "note.created", flowPath: "f.canvas" }])).toBe(false);
        expect(wantsReviewDue([binding])).toBe(true);
        expect(wantsReviewDue([{ ...binding, enabled: false }])).toBe(false);
    });
});

/**
 * No scheduler (#563 FR-4, and the epic's biggest risk).
 *
 * The engine owns every listener and timer in this feature, and `disarm()` has to stay complete.
 * The sweep is therefore allowed to ride the callbacks that already exist — and nothing else.
 */
describe("the sweep adds no timer and no listener (#563)", () => {
    it("registers neither an interval nor a timeout of its own", () => {
        const sweep = ENGINE.slice(ENGINE.indexOf("private sweepReviewDue"));
        expect(sweep).not.toContain("setInterval");
        expect(sweep).not.toContain("registerInterval");
        expect(sweep).not.toContain("setTimeout");
        expect(sweep).not.toContain("this.track(");
    });

    it("is called from arming and from the pass that already runs", () => {
        expect(ENGINE).toContain("this.sweepReviewDue()");
        expect((ENGINE.match(/this\.sweepReviewDue\(\)/g) ?? [])).toHaveLength(2);
    });

    it("gives its throttle back when the engine disarms", () => {
        const disarm = ENGINE.slice(ENGINE.indexOf("public disarm()"), ENGINE.indexOf("private track("));
        expect(disarm).toContain("this.reviewDueThrottle.reset()");
    });

    it("returns before touching the model when nothing is bound to it", () => {
        const sweep = ENGINE.slice(ENGINE.indexOf("private sweepReviewDue"));
        const guard = sweep.indexOf("wantsReviewDue(this.bindings)");
        const model = sweep.indexOf("KnowledgeIndex.getInstance()");
        expect(guard).toBeGreaterThan(-1);
        expect(guard).toBeLessThan(model);
    });
});
