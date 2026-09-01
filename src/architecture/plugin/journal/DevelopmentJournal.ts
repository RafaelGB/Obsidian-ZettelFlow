import { recordDay } from "architecture/knowledge/journal/heatmap";

/** Debounce settings writes so a burst of edits collapses to one save. */
const SAVE_DEBOUNCE_MS = 1500;

/** The minimal plugin surface the journal needs — injected so this stays runtime-light and testable. */
export interface JournalHost {
    settings: { journal: { enabled: boolean; counts: Record<string, number> } };
    saveSettings(): Promise<void> | void;
}

/**
 * Runtime owner of the development-event tally (#162). Reads/writes the on-by-default, privacy-safe
 * per-day count map in `settings.journal.counts` (no note paths, no content, no network), pruned to
 * the last ~year, persisted via a debounced save. The update itself is the pure {@link recordDay}.
 * The host plugin is injected via {@link init} at load (so this module never imports `main`);
 * before that, everything safely no-ops. `getInstance()` singleton, like the rest of the runtime.
 */
export class DevelopmentJournal {
    private static instance: DevelopmentJournal;
    private host: JournalHost | null = null;
    private saveTimer: number | undefined;

    public static getInstance(): DevelopmentJournal {
        if (!DevelopmentJournal.instance) DevelopmentJournal.instance = new DevelopmentJournal();
        return DevelopmentJournal.instance;
    }

    /** Wire the host plugin (called once at plugin load). */
    public init(host: JournalHost): void {
        this.host = host;
    }

    /** Whether recording is on — false until initialized, or when the user disables it. */
    public enabled(): boolean {
        return this.host?.settings.journal.enabled ?? false;
    }

    /** The persisted per-day tally (the heatmap's data source). */
    public dailyCounts(): Record<string, number> {
        return this.host?.settings.journal.counts ?? {};
    }

    /** Record one development event at `now`, pruning old days and scheduling a debounced save. */
    public record(now: number = Date.now()): void {
        if (!this.host) return;
        const journal = this.host.settings.journal;
        journal.counts = recordDay(journal.counts, now);
        this.scheduleSave();
    }

    private scheduleSave(): void {
        window.clearTimeout(this.saveTimer);
        this.saveTimer = window.setTimeout(() => {
            void this.host?.saveSettings();
        }, SAVE_DEBOUNCE_MS);
    }

    /** Cancel any pending debounced save and persist immediately (call on plugin unload). */
    public flush(): void {
        window.clearTimeout(this.saveTimer);
        void this.host?.saveSettings();
        // Only ever called from `onunload`: drop the plugin reference so this static
        // singleton does not outlive the plugin it was wired to across a disable/enable.
        this.host = null;
    }
}
