/**
 * Re-entrancy / loop protection (#150). A workflow fired by an event may write the same note, and
 * that write would re-enter as a new event — an unbounded loop. Two layers stop it (maintainer
 * decision OQ-5):
 *
 *  1. **Origin suppression** — `isSelfWrite` consults the same `VaultStateManager` freeze / on-process
 *     state the property hooks already use to hide ZettelFlow's own writes. A change made while the
 *     vault is frozen (or on the note currently being processed) is ours, not the user's → skipped.
 *  2. **Bounded backstop** — a per-note `CascadeGuard` caps re-entry depth at `MAX_CASCADE_DEPTH` so
 *     even an *indirect* cascade the freeze doesn't catch terminates.
 *
 * Both are pure & Obsidian-free; the runtime engine injects the freeze/on-process state.
 */

/** The re-entry depth cap: a note's own event-driven run may not recurse (fire at most once). */
export const MAX_CASCADE_DEPTH = 1;

/** The minimal `VaultStateManager` view the guard needs, injected by the engine. */
export interface SelfWriteState {
    /** `VaultStateManager.isFreezed()` — a ZettelFlow write is in progress. */
    frozen: boolean;
    /** Paths currently being processed by ZettelFlow (`isOnProcess`). */
    onProcessPaths?: string[];
}

/** Whether a change to `notePath` originated from ZettelFlow's own write (and must not retrigger). */
export function isSelfWrite(notePath: string, state: SelfWriteState): boolean {
    if (state.frozen) return true;
    return (state.onProcessPaths ?? []).includes(notePath);
}

export class CascadeGuard {
    private readonly maxDepth: number;
    private readonly depth = new Map<string, number>();

    constructor(maxDepth: number = MAX_CASCADE_DEPTH) {
        this.maxDepth = maxDepth;
    }

    /** Whether a new event-driven run for `notePath` is allowed (current depth below the cap). */
    allows(notePath: string): boolean {
        return (this.depth.get(notePath) ?? 0) < this.maxDepth;
    }

    /** Mark a run entering for `notePath`. Pair with `exit`. */
    enter(notePath: string): void {
        this.depth.set(notePath, (this.depth.get(notePath) ?? 0) + 1);
    }

    /** Mark a run leaving for `notePath`, letting a future genuine event fire again. */
    exit(notePath: string): void {
        const next = (this.depth.get(notePath) ?? 0) - 1;
        if (next <= 0) this.depth.delete(notePath);
        else this.depth.set(notePath, next);
    }

    /** Forget all depth state (engine disarm). */
    reset(): void {
        this.depth.clear();
    }
}
