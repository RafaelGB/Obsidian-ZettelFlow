/**
 * Tracks which canvas patches attached vs. degraded (#304), so a changed Obsidian internal degrades
 * gracefully — logged and reported once — instead of breaking the canvas. Pure and Obsidian-free: the
 * one user-facing side effect (a Notice) is injected as `onFirstDegrade`, so this is unit-testable.
 */
export type PatchState = "attached" | "degraded";

export class CanvasPatchStatus {
    private readonly states = new Map<string, PatchState>();
    private readonly notified = new Set<string>();

    /** `onFirstDegrade` fires the first time each named patch degrades (e.g. to show a Notice once). */
    constructor(private readonly onFirstDegrade: (name: string) => void = () => undefined) {}

    /** Record a patch as attached — never overrides a prior `degraded` (a later success can't un-break it). */
    markAttached(name: string): void {
        if (this.states.get(name) !== "degraded") this.states.set(name, "attached");
    }

    /** Record a patch as degraded; the injected callback fires only the first time for this name. */
    markDegraded(name: string): void {
        this.states.set(name, "degraded");
        if (!this.notified.has(name)) {
            this.notified.add(name);
            this.onFirstDegrade(name);
        }
    }

    state(name: string): PatchState | undefined {
        return this.states.get(name);
    }

    /** Snapshot of every tracked patch, insertion order. */
    summary(): { name: string; state: PatchState }[] {
        return [...this.states].map(([name, state]) => ({ name, state }));
    }

    degradedCount(): number {
        let count = 0;
        for (const state of this.states.values()) if (state === "degraded") count++;
        return count;
    }

    /** A short human-readable line for the log (e.g. "canvas patches: 2 attached, 1 degraded"). */
    describe(): string {
        const total = this.states.size;
        const degraded = this.degradedCount();
        return `canvas patches: ${total - degraded} attached, ${degraded} degraded`;
    }
}
