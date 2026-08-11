/**
 * The WAIT suspend/resume/abort state machine (#151) — the risky bit of the WAIT primitive, kept
 * pure so every transition is unit-tested. The note-builder wizard creates one machine when it
 * reaches a WAIT node, opens the confirmation prompt, and drives the machine from the prompt's
 * callbacks. Guarantees: a workflow **advances at most once** past a WAIT (a double-click / repeated
 * confirm can't double-run), and any teardown/cancel **fails safe** (aborts, never resumes). No
 * timers — v1 WAIT is human confirmation only (OQ-2). Obsidian-free.
 */

export type WaitPhase = "running" | "waiting" | "resumed" | "aborted";

export class WaitMachine {
    private current: WaitPhase = "running";

    get phase(): WaitPhase {
        return this.current;
    }

    /** Suspend the run at the WAIT node. Only meaningful from `running`. */
    reachWait(): void {
        if (this.current === "running") this.current = "waiting";
    }

    /**
     * Resume the run. Returns `true` **only** on the transition that actually resumes (`waiting →
     * resumed`), so the caller advances the wizard exactly once; any later confirm is a no-op → `false`.
     */
    confirm(): boolean {
        if (this.current === "waiting") {
            this.current = "resumed";
            return true;
        }
        return false;
    }

    /** Abort the run (user cancelled). Fail-safe: only from `waiting`; terminal states are immutable. */
    cancel(): void {
        if (this.current === "waiting") this.current = "aborted";
    }

    /** Abort the run (modal/teardown closed without a choice). Same fail-safe semantics as `cancel`. */
    teardown(): void {
        if (this.current === "waiting") this.current = "aborted";
    }
}
