import type { Idea } from "architecture/knowledge/model/Idea";
import { recordSnapshot, Snapshot } from "architecture/knowledge/timeline/recordSnapshot";
import { evictOldestNotes } from "architecture/knowledge/timeline/evictOldestNotes";

/** Debounce settings writes so a burst of edits collapses to one save. */
const SAVE_DEBOUNCE_MS = 1500;

/** The minimal plugin surface the timeline needs — injected so this stays runtime-light and testable. */
export interface TimelineHost {
    settings: { timeline: { enabled: boolean; snapshots: Record<string, Snapshot[]> } };
    saveSettings(): Promise<void> | void;
}

/**
 * Runtime owner of the conceptual evolution timeline (#168). Captures a {@link Snapshot} of a note's
 * lifecycle state + claim texts whenever it meaningfully changes (the pure {@link recordSnapshot}
 * diff-gate), stores them per note in `settings.timeline.snapshots`, and keeps the store bounded
 * (per-note via `recordSnapshot`, total via {@link evictOldestNotes}). On-by-default but opt-out;
 * fully local, never networked. The host plugin is injected via {@link init} at load (so this module
 * never imports `main`); before that, everything safely no-ops. `getInstance()` singleton.
 */
export class ConceptualTimeline {
    private static instance: ConceptualTimeline;
    private host: TimelineHost | null = null;
    private saveTimer: number | undefined;

    public static getInstance(): ConceptualTimeline {
        if (!ConceptualTimeline.instance) ConceptualTimeline.instance = new ConceptualTimeline();
        return ConceptualTimeline.instance;
    }

    /** Wire the host plugin (called once at plugin load). */
    public init(host: TimelineHost): void {
        this.host = host;
    }

    /** Whether recording is on — false until initialized, or when the user disables it. */
    public enabled(): boolean {
        return this.host?.settings.timeline.enabled ?? false;
    }

    /** The stored snapshot sequence for a note (oldest→newest), or `[]`. */
    public snapshotsFor(path: string): Snapshot[] {
        return this.host?.settings.timeline.snapshots[path] ?? [];
    }

    /** Capture a snapshot of `idea` at `now` if it meaningfully changed, then prune to the notes cap. */
    public capture(idea: Idea, now: number = Date.now()): void {
        if (!this.host || !this.enabled()) return;
        const timeline = this.host.settings.timeline;
        const current = timeline.snapshots[idea.path] ?? [];
        const next = recordSnapshot(current, idea, now);
        if (next === current) return;
        timeline.snapshots = evictOldestNotes({ ...timeline.snapshots, [idea.path]: next });
        this.scheduleSave();
    }

    /** Drop a note's timeline when the note is deleted. */
    public prune(path: string): void {
        if (!this.host) return;
        const snapshots = this.host.settings.timeline.snapshots;
        if (!(path in snapshots)) return;
        const rest: Record<string, Snapshot[]> = {};
        for (const key of Object.keys(snapshots)) if (key !== path) rest[key] = snapshots[key];
        this.host.settings.timeline.snapshots = rest;
        this.scheduleSave();
    }

    /** Move a note's timeline to its new path on rename. */
    public rekey(oldPath: string, newPath: string): void {
        if (!this.host || oldPath === newPath) return;
        const snapshots = this.host.settings.timeline.snapshots;
        const history = snapshots[oldPath];
        if (!history) return;
        const next: Record<string, Snapshot[]> = {};
        for (const key of Object.keys(snapshots)) if (key !== oldPath) next[key] = snapshots[key];
        next[newPath] = history;
        this.host.settings.timeline.snapshots = next;
        this.scheduleSave();
    }

    private scheduleSave(): void {
        // `window` is absent under the Node test runner; the mutation already landed, so skip timing.
        if (typeof window === "undefined") return;
        window.clearTimeout(this.saveTimer);
        this.saveTimer = window.setTimeout(() => {
            void this.host?.saveSettings();
        }, SAVE_DEBOUNCE_MS);
    }

    /** Cancel any pending debounced save and persist immediately (call on plugin unload). */
    public flush(): void {
        if (typeof window !== "undefined") window.clearTimeout(this.saveTimer);
        void this.host?.saveSettings();
        // Only ever called from `onunload`: drop the plugin reference so this static
        // singleton does not outlive the plugin it was wired to across a disable/enable.
        this.host = null;
    }
}
