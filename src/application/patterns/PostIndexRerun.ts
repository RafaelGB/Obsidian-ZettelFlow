import type { Action } from "architecture/api";
import type { TFile } from "obsidian";

/**
 * Runs a note's on-creation pattern once the note is indexed and writes the graph-computed keys back
 * to the note. Injected by the create path so this singleton stays pure wiring — it owns the timing
 * (a one-shot per-path `metadata resolve` signal), the bounded give-up, and the re-entrancy guard,
 * not how the delta is computed or written (that is the pure `postIndexRerunCore`, closed over here).
 */
export type PatternRerunner = (file: TFile, actions: Action[]) => Promise<void>;

/**
 * The one-shot post-index re-run wiring (#200). After a note is created **from a pattern with
 * on-creation actions**, {@link arm} waits — via a per-path `metadataCache.on("resolve")` listener
 * and a bounded timeout — for the created note to be indexed with resolved links, then runs the
 * re-run exactly once. Never wired to `modify`/`create`; a per-path guard makes it idempotent, so
 * the re-run's own frontmatter write cannot re-arm it. Invariant: one create ⇒ at most one re-run.
 */
export class PostIndexRerun {
    private static _instance: PostIndexRerun;

    public static getInstance(): PostIndexRerun {
        if (!PostIndexRerun._instance) {
            PostIndexRerun._instance = new PostIndexRerun();
        }
        return PostIndexRerun._instance;
    }

    /**
     * Arm the one-shot re-run for a freshly created note. No-op when disabled or when the pattern has
     * no on-creation actions (FR-5, AC-3) — no index read, no listener, no timer. The armed path
     * (one-shot `resolve` listener + bounded timeout + re-entrancy guard) is added by T4–T6.
     */
    public arm(file: TFile, actions: Action[], enabled: boolean, runner: PatternRerunner): void {
        if (!enabled) return;
        if (actions.length === 0) return;
        // Armed path implemented next (T4–T6): one-shot metadata-resolve listener + timeout + guard.
        void file;
        void runner;
    }
}
