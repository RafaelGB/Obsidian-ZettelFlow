import { ObsidianApi } from "architecture/plugin/ObsidianAPI";
import { recordDay } from "architecture/knowledge/journal/heatmap";

/** Debounce settings writes so a burst of edits collapses to one save. */
const SAVE_DEBOUNCE_MS = 1500;

/**
 * Runtime owner of the development-event tally (#162). Reads/writes the on-by-default, privacy-safe
 * per-day count map in `settings.journal.counts` (no note paths, no content, no network), pruned to
 * the last ~year, persisted via a debounced `saveSettings`. All state lives in settings — the update
 * itself is the pure {@link recordDay}. `getInstance()` singleton, like the rest of the runtime.
 */
export class DevelopmentJournal {
    private static instance: DevelopmentJournal;
    private saveTimer: number | undefined;

    public static getInstance(): DevelopmentJournal {
        if (!DevelopmentJournal.instance) DevelopmentJournal.instance = new DevelopmentJournal();
        return DevelopmentJournal.instance;
    }

    private journal(): { enabled: boolean; counts: Record<string, number> } {
        return ObsidianApi.getOwnPlugin().settings.journal;
    }

    /** Whether recording is on (the user can disable it in settings). */
    public enabled(): boolean {
        return this.journal().enabled;
    }

    /** The persisted per-day tally (the heatmap's data source). */
    public dailyCounts(): Record<string, number> {
        return this.journal().counts;
    }

    /** Record one development event at `now`, pruning old days and scheduling a debounced save. */
    public record(now: number = Date.now()): void {
        const journal = this.journal();
        journal.counts = recordDay(journal.counts, now);
        this.scheduleSave();
    }

    private scheduleSave(): void {
        window.clearTimeout(this.saveTimer);
        this.saveTimer = window.setTimeout(() => {
            void ObsidianApi.getOwnPlugin().saveSettings();
        }, SAVE_DEBOUNCE_MS);
    }
}
