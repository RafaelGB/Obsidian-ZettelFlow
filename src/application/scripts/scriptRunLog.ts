/**
 * What a script did, kept as a fact (#444, epic #443) — pure.
 *
 * A script that fails while you are not watching tells nobody: a `Notice` and a console line, both
 * gone by morning. Property hooks and event flows run **unattended** by definition — the one case
 * where a transient message is worth nothing.
 *
 * So every run leaves a record. Facts only (§XII): when, which surface, where it came from, how
 * long it took, and whether it threw. No severity, no ranking, no advice — and **no note content**:
 * paths, names and the *keys* a script was handed, never their values, because a run log must not
 * become a second copy of your vault.
 */

/** The five places ZettelFlow runs code, plus the workbench where you try it (#446). */
export type ScriptSurface = "action" | "selector" | "hook" | "condition" | "library" | "workbench";

/** Where the script lives and what it ran on. */
export interface ScriptRunOrigin {
    /** A stable reference to the script: a flow path, a hook id, a library file path. */
    ref?: string;
    /** What to call it on screen. */
    label?: string;
    /** The note it ran on, when there was one. */
    notePath?: string;
}

export interface ScriptRunError {
    message: string;
    /** The line, when the runtime gives one. */
    line?: number;
}

export interface ScriptRun {
    id: string;
    /** Unix ms. */
    at: number;
    surface: ScriptSurface;
    origin: ScriptRunOrigin;
    durationMs: number;
    ok: boolean;
    error?: ScriptRunError;
    /** The names of what the script was handed — never the values. */
    inputKeys?: string[];
}

/** How long a run is kept, in days. */
export const DEFAULT_RETENTION_DAYS = 7;
export const MAX_RETENTION_DAYS = 30;
export const MIN_RETENTION_DAYS = 1;

/**
 * A safety cap, not the policy. Retention is by time; this only stops a vault that runs a
 * condition on every keystroke from bloating `data.json` between two prunes.
 */
export const MAX_RUNS = 2000;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RetentionOptions {
    /** Injected so a test does not have to wait a week. */
    now: number;
    retentionDays: number;
}

/** The retention window, held between one day and thirty. */
export function clampRetention(days: number | undefined): number {
    if (!Number.isFinite(days)) return DEFAULT_RETENTION_DAYS;
    return Math.min(MAX_RETENTION_DAYS, Math.max(MIN_RETENTION_DAYS, Math.round(days as number)));
}

/** Drop what is older than the window, and anything past the safety cap. */
export function pruneRuns(runs: ScriptRun[], { now, retentionDays }: RetentionOptions): ScriptRun[] {
    const oldest = now - clampRetention(retentionDays) * DAY_MS;
    const kept = runs.filter((run) => run.at >= oldest);
    return kept.length > MAX_RUNS ? kept.slice(0, MAX_RUNS) : kept;
}

/** Newest first, pruned as it goes — the append is the only place the log grows. */
export function appendRun(
    runs: ScriptRun[],
    run: ScriptRun,
    options: RetentionOptions
): ScriptRun[] {
    return pruneRuns([run, ...runs], options);
}

export interface RunFilter {
    surface?: ScriptSurface;
    /** The script's reference — everything one hook, flow or library file did. */
    ref?: string;
    notePath?: string;
    failuresOnly?: boolean;
}

export function filterRuns(runs: ScriptRun[], filter: RunFilter): ScriptRun[] {
    return runs.filter((run) => {
        if (filter.surface && run.surface !== filter.surface) return false;
        if (filter.ref && run.origin.ref !== filter.ref) return false;
        if (filter.notePath && run.origin.notePath !== filter.notePath) return false;
        if (filter.failuresOnly && run.ok) return false;
        return true;
    });
}

/**
 * What a script was handed, as names. The values are the note's content and a log that stored them
 * would be a copy of the vault with none of its protections.
 */
export function summariseInput(input: Record<string, unknown> | undefined): string[] {
    return input ? Object.keys(input) : [];
}

export interface FailureSummary {
    count: number;
    /** Unix ms of the most recent failure, when there is one. */
    lastAt?: number;
}

/**
 * How often one script has failed, read from the log rather than counted a second time — so the
 * count cannot disagree with the entries it is a count of.
 */
export function failureSummary(runs: ScriptRun[], ref: string): FailureSummary {
    const failures = runs.filter((run) => run.origin.ref === ref && !run.ok);
    return {
        count: failures.length,
        ...(failures.length > 0 ? { lastAt: Math.max(...failures.map((run) => run.at)) } : {}),
    };
}
