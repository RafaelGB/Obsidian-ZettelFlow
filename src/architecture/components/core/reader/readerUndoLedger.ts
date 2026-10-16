/**
 * **The reading's undo ledger** (#810 FR-15–FR-18) — pure.
 *
 * Every write the Reader offers an Undo for is offered here too, as the *same* guarded run: the
 * status line's button and Ctrl/⌘+Z share one guard, so nothing is taken back twice (FR-17). The key
 * takes the newest write not yet taken back; a reading opened or the Reader closed starts it again.
 * A write changed since it was made is refused, and counts as handled (FR-18).
 */

/** What taking a write back did: it was undone, refused (changed since), or had already gone. */
export type UndoOutcome = "undone" | "refused" | "spent";

/** A way back, guarded: once, whoever asks first. */
export type GuardedUndo = () => Promise<UndoOutcome>;

interface Entry {
    run: () => unknown;
    check?: () => Promise<boolean> | boolean;
    done: boolean;
}

export class UndoLedger {
    private entries: Entry[] = [];

    /**
     * Offer a write's way back. `check` says whether it can still be applied — the thought is on disk
     * as it was written. Returns the guarded run every caller uses: the button and the key alike.
     */
    offer(run: () => unknown, check?: () => Promise<boolean> | boolean): GuardedUndo {
        const entry: Entry = { run, ...(check ? { check } : {}), done: false };
        this.entries.push(entry);
        return () => this.apply(entry);
    }

    /** The newest write not yet taken back, guarded — or `null` when the reading has none left. */
    takeLast(): GuardedUndo | null {
        for (let i = this.entries.length - 1; i >= 0; i--) {
            const entry = this.entries[i];
            if (!entry.done) return () => this.apply(entry);
        }
        return null;
    }

    /** How many writes can still be taken back. */
    pending(): number {
        return this.entries.filter((entry) => !entry.done).length;
    }

    /** A reading opened, or the Reader closed: nothing earlier can be reached (FR-15). */
    reset(): void {
        this.entries = [];
    }

    private async apply(entry: Entry): Promise<UndoOutcome> {
        if (entry.done) return "spent";
        entry.done = true;
        if (entry.check && !(await entry.check())) return "refused";
        await entry.run();
        return "undone";
    }
}
