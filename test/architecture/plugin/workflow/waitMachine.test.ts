import { describe, it, expect } from "@jest/globals";
import { WaitMachine } from "architecture/plugin/workflow/waitMachine";

describe("WaitMachine — suspend / resume-once / abort (AC-3)", () => {
    it("starts running and suspends to waiting on reachWait", () => {
        const m = new WaitMachine();
        expect(m.phase).toBe("running");
        m.reachWait();
        expect(m.phase).toBe("waiting");
    });

    it("resumes exactly once: the first confirm advances, a second is a no-op", () => {
        const m = new WaitMachine();
        m.reachWait();
        expect(m.confirm()).toBe(true); // this transition advances the wizard
        expect(m.phase).toBe("resumed");
        expect(m.confirm()).toBe(false); // second confirm must not advance again
        expect(m.phase).toBe("resumed");
    });

    it("aborts on cancel and on teardown (fail safe — no resume)", () => {
        const cancelled = new WaitMachine();
        cancelled.reachWait();
        cancelled.cancel();
        expect(cancelled.phase).toBe("aborted");

        const torn = new WaitMachine();
        torn.reachWait();
        torn.teardown();
        expect(torn.phase).toBe("aborted");
    });

    it("resumed and aborted are terminal", () => {
        const resumed = new WaitMachine();
        resumed.reachWait();
        resumed.confirm();
        resumed.cancel();
        resumed.teardown();
        expect(resumed.phase).toBe("resumed"); // cannot be dragged back to aborted

        const aborted = new WaitMachine();
        aborted.reachWait();
        aborted.cancel();
        expect(aborted.confirm()).toBe(false);
        expect(aborted.phase).toBe("aborted");
    });

    it("reachWait only fires from running", () => {
        const m = new WaitMachine();
        m.reachWait();
        m.confirm();
        m.reachWait(); // no effect once resumed
        expect(m.phase).toBe("resumed");
    });
});
