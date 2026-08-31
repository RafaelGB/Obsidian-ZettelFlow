import {
    recordJudgement,
    judgementDays,
    sanitizeJudgementLog,
    type Judgement,
} from "architecture/knowledge/judgement";
import { isPathExcluded, scopeExcludedPaths, type ScopeSettings } from "architecture/knowledge/scope/knowledgeScope";

/** Debounce settings writes so a burst of verdicts collapses to one save. */
const SAVE_DEBOUNCE_MS = 1500;

/** The minimal plugin surface the log needs — injected, so this stays runtime-light and testable. */
export interface JudgementHost {
    settings: ScopeSettings & {
        judgements: { enabled: boolean; log: Judgement[] };
    };
    saveSettings(): Promise<void> | void;
}

/** A verdict as the caller gives it: the timestamp is stamped here. */
export type JudgementEntry = Omit<Judgement, "at"> & { at?: number };

/**
 * Runtime owner of the **judgement record** (#336, epic #335) — the two impure concerns the pure
 * `knowledge/judgement` domain must not know about: the **knowledge scope** filter and persistence.
 *
 * Mirrors {@link DevelopmentJournal}: an injected host (so this module never imports `main`), a
 * debounced save, a `flush()` on unload, and a safe no-op before `init`. The append itself is the pure
 * {@link recordJudgement}, and a corrupt persisted blob degrades to an empty log rather than throwing.
 *
 * What lands in `data.json` is locale-free descriptors only — a path, a short subject id, an origin and
 * a verdict. No note content and no model output ever reach it.
 */
export class JudgementLog {
    private static instance: JudgementLog;
    private host: JudgementHost | null = null;
    private saveTimer: number | undefined;

    public static getInstance(): JudgementLog {
        if (!JudgementLog.instance) JudgementLog.instance = new JudgementLog();
        return JudgementLog.instance;
    }

    /** Wire the host plugin (called once at plugin load). */
    public init(host: JudgementHost): void {
        this.host = host ?? null;
    }

    /** Whether recording is on — false until initialized, or when the user disables it. */
    public enabled(): boolean {
        return this.host?.settings.judgements?.enabled ?? false;
    }

    /** The persisted log, sanitised — always a well-formed array, even from a corrupt blob. */
    public entries(): Judgement[] {
        return sanitizeJudgementLog(this.host?.settings.judgements?.log);
    }

    /**
     * Verdicts per UTC day — **the** definition of a judgement day (#339). The development streak reads
     * this instead of the journal's event tally, so momentum measures days you exercised judgement
     * rather than days something merely happened. Mirrors `DevelopmentJournal.dailyCounts()` so the swap
     * is obvious at the call site, and lives here so Home and Cultivate cannot drift apart.
     */
    public dailyCounts(): Record<string, number> {
        return judgementDays(this.entries());
    }

    /**
     * Record one verdict. Silently does nothing when the log is disabled, before `init`, for a
     * malformed entry, or for a note **outside the knowledge scope** (#311) — an excluded path never
     * becomes an idea, so it never accrues judgements either. Never throws.
     */
    public record(entry: JudgementEntry, now: number = Date.now()): void {
        if (!this.host || !this.enabled()) return;

        const settings = this.host.settings;
        if (isPathExcluded(entry.path ?? "", scopeExcludedPaths(settings))) return;

        const current = this.entries();
        const next = recordJudgement(current, { ...entry, at: entry.at ?? now });
        if (next === current && settings.judgements.log === current) return;

        settings.judgements.log = next;
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
    }
}
