import { ObsidianApi } from "architecture";
import type { Action } from "architecture/api";
import type { TFile, EventRef } from "obsidian";

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
    /** Paths already armed — the re-entrancy guard. Marked at arm time so neither the re-run's own
     * write nor any later edit can re-arm the note (FR-3, AC-5). Never cleared: one create ⇒ one arm. */
    private readonly handled = new Set<string>();

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

        const target = file.path;
        // Re-entrancy guard: mark the path terminal before arming, so the re-run's own write cannot
        // re-arm it and a later edit cannot start a second re-run (FR-3, AC-5).
        if (this.handled.has(target)) return;
        this.handled.add(target);

        const metadataCache = ObsidianApi.metadataCache();
        // One-shot, per-path readiness signal — NOT the global "resolved" rebuild event. Fires when
        // this note's links are resolved; gated on the note actually being in `resolvedLinks`.
        const ref: EventRef = metadataCache.on("resolve", (resolved: TFile) => {
            if (resolved.path !== target) return;
            if (!metadataCache.resolvedLinks[target]) return;
            // Unsubscribe the instant it fires, so the re-run's own write (which re-indexes the note
            // and fires "resolve" again) reaches no handler — the loop guard (FR-3, AC-2/AC-5).
            metadataCache.offref(ref);
            void runner(file, actions);
        });
    }
}
