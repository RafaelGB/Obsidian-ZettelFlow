import { v4 as uuid4 } from "uuid";
import { log } from "architecture/monitoring/Logger";
import { isPathExcluded, scopeExcludedPaths, type ScopeSettings } from "architecture/knowledge/scope/knowledgeScope";
import {
    MOVE_CEILING,
    MOVES_PER_SUBJECT,
    newMove,
    movesFor,
    pruneMoves,
    sanitizeMoveLog,
    type Move,
} from "application/thinking/move";

/**
 * Runtime owner of the **move record** (#491, epic #489).
 *
 * `JudgementLog` with a different payload and one extra promise, and the promise is the point:
 *
 * > **Nothing records itself.**
 *
 * The easiest way to make this log feel rich would be to infer a move from a vault event — and
 * that is the moment a record of *your thinking* becomes telemetry, which this project deleted on
 * purpose (#360). Only a gesture you made reaches this door, and the allow-list in
 * `moveSeam.test.ts` derives the callers from the source so a new one forces a decision.
 *
 * Everything else mirrors `JudgementLog` deliberately rather than inventing a second persistence
 * idiom: an injected host (so this never imports `main`), a debounced save, `flush()` on unload,
 * and a safe no-op before `init` — the #374 rule, because at load time there is no plugin to ask.
 */

/** Debounce settings writes so a burst of moves collapses to one save. */
const SAVE_DEBOUNCE_MS = 1500;

/** The minimal plugin surface the log needs — injected, so this stays runtime-light and testable. */
export interface MoveHost {
    settings: ScopeSettings & { moves: { log: Move[] } };
    saveSettings(): Promise<void> | void;
}

/**
 * A move as the caller gives it: the id and the clock are stamped here unless supplied.
 *
 * Both are injectable for the same reason `VaultWriteSink` makes them injectable — a record whose
 * identity comes from a global is a record you cannot test. (It is not hypothetical: under jest's
 * environment `uuid4()` returns the same value twice, which a log keyed on it would silently
 * collapse.)
 */
export type MoveEntry = Omit<Move, "id" | "at"> & { at?: number; id?: string };

export class MoveLog {
    private static instance: MoveLog;
    private host: MoveHost | null = null;
    private saveTimer: number | undefined;

    public static getInstance(): MoveLog {
        if (!MoveLog.instance) MoveLog.instance = new MoveLog();
        return MoveLog.instance;
    }

    /** Wire the host plugin (called once at plugin load). */
    public init(host: MoveHost): void {
        this.host = host ?? null;
    }

    /** Drop the host without persisting — for tests, and for a clean disable/enable. */
    public reset(): void {
        window.clearTimeout(this.saveTimer);
        this.host = null;
    }

    /** The persisted log, sanitised — always well-formed, even from a corrupt blob. */
    public all(): Move[] {
        return sanitizeMoveLog(this.host?.settings.moves?.log);
    }

    /** One subject's history, oldest first — what a replay reads. */
    public forSubject(subject: string): Move[] {
        return movesFor(subject, this.all());
    }

    /**
     * Write one move down. Returns what was recorded, or nothing when it was refused.
     *
     * Never throws: a log that breaks the gesture it was observing is worse than no log, the same
     * rule `recordVaultWrite` follows.
     */
    public record(entry: MoveEntry, now: number = Date.now()): Move | undefined {
        if (!this.host) return undefined;
        try {
            if (!this.inScope(entry.subject)) return undefined;
            const move = newMove({ ...entry, id: entry.id ?? uuid4(), at: entry.at ?? now });
            this.host.settings.moves.log = pruneMoves([...this.all(), move], {
                perSubject: MOVES_PER_SUBJECT,
                ceiling: MOVE_CEILING,
            });
            this.scheduleSave();
            return move;
        } catch (error) {
            log.warn("[moves] could not record a move", error);
            return undefined;
        }
    }

    /** Take a move back. Touches the log and nothing else — never the note it referred to. */
    public remove(id: string): void {
        if (!this.host) return;
        const kept = this.all().filter((move) => move.id !== id);
        this.host.settings.moves.log = kept;
        this.scheduleSave();
    }

    /**
     * The knowledge scope (#311) applies, **with one deliberate exception**: the thinking folder.
     *
     * That folder is excluded from the *model* so a raw thought is never an orphan, never debt and
     * never appears in Health. It is not excluded from **your own history** — a thought is exactly
     * the thing whose moves you want to keep, and silently dropping them would be the feature
     * failing invisibly in its own home.
     */
    private inScope(subject: string): boolean {
        const settings = this.host?.settings;
        if (!settings) return false;
        const lab = settings.thoughtLabPath?.trim();
        if (lab && isPathExcluded(subject, [lab])) return true;
        return !isPathExcluded(subject, scopeExcludedPaths(settings));
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
        // Only ever called from `onunload`: drop the plugin reference so this static singleton
        // does not outlive the plugin it was wired to across a disable/enable.
        this.host = null;
    }
}
