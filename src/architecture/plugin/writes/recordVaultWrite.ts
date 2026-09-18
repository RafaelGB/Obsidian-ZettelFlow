import { v4 as uuid4 } from "uuid";
import { log } from "architecture/monitoring/Logger";
import { ObsidianApi } from "architecture/plugin/ObsidianAPI";
import {
    appendWrite,
    DEFAULT_WRITE_RETENTION_DAYS,
    type VaultWrite,
    type WriteKind,
} from "application/writes/vaultWriteLog";
import { UNATTRIBUTED, type WriteOrigin } from "application/writes/writeAttribution";

/**
 * The one place a write becomes a record (#453, epic #451).
 *
 * This is `recordScriptRun` (#444) for the other half of the story: that module is the only place
 * a *run* is written down, this is the only place a *write* is. The rule it inherits is the one
 * that matters — **observing must never change what was observed**. Every path here is wrapped,
 * and a recorder that fails logs and gives up rather than turning a working note into a broken
 * one.
 *
 * What it adds is the **batch**. A flow creates a note, a satellite and sets two properties; those
 * are four writes and one action, and `withWriteBatch` is what says so, so that later they can be
 * taken back as the one thing they always were.
 */

/** Where the record lives and what time it is — injected, so the whole thing is testable offline. */
export interface VaultWriteSink {
    read(): { writes: VaultWrite[] };
    write(state: { writes: VaultWrite[] }): void;
    now(): number;
    id(): string;
}

export interface VaultWriteFacts {
    kind: WriteKind;
    path: string;
    /** Where a moved file came from. */
    from?: string;
    /** Left out when a batch is already saying who is writing. */
    origin?: WriteOrigin;
    /** The note's properties **before** the write — narrowed here to the keys `after` touched. */
    before?: Record<string, unknown>;
    /** The properties this write set. */
    after?: Record<string, unknown>;
    /** For `content-appended`: the text added, so it can be removed again. */
    appended?: string;
}

/** The plugin's settings, read lazily: at load time there is no plugin to ask yet (#374). */
const settingsSink: VaultWriteSink = {
    read: () => ({ writes: ObsidianApi.getOwnPlugin()?.settings.writeLog?.writes ?? [] }),
    write: (state) => {
        const plugin = ObsidianApi.getOwnPlugin();
        if (!plugin) return;
        plugin.settings.writeLog = { writes: state.writes };
        void plugin.saveSettings();
    },
    now: () => Date.now(),
    id: () => uuid4(),
};

/**
 * The batch in progress. A stack rather than a single value, because a flow can start an action
 * that starts a write, and all three are one thing you undo — the **outermost** batch wins, while
 * the innermost origin is still the more accurate answer to "who wrote this file".
 */
const stack: { batch: string; origin: WriteOrigin }[] = [];

/**
 * Undo is the one thing that writes and must **not** be recorded: putting a note back is not a new
 * thing ZettelFlow did to your vault, and recording it would leave an undo you could undo.
 */
let recording = true;

/** Run `work` with recording off. Always restores it, including when the work throws. */
export async function withoutRecording<T>(work: () => Promise<T>): Promise<T> {
    const previous = recording;
    recording = false;
    try {
        return await work();
    } finally {
        recording = previous;
    }
}

/** The batch a write would join right now — what a caller needs to offer an undo for it (#455). */
export function currentWriteBatch(): string | undefined {
    return stack.length > 0 ? stack[0].batch : undefined;
}

/** The origin a write would inherit right now — exported for the tests and for R4's seam. */
export function currentWriteOrigin(): WriteOrigin | undefined {
    return stack.length > 0 ? stack[stack.length - 1].origin : undefined;
}

/**
 * Everything written inside `work` belongs to one batch.
 *
 * Returns what the work returned and lets its failure through untouched: this is bookkeeping
 * wrapped around a unit of work, never a `try` that swallows it.
 */
export async function withWriteBatch<T>(origin: WriteOrigin, work: () => Promise<T>): Promise<T> {
    const batch = stack.length > 0 ? stack[0].batch : uuid4();
    stack.push({ batch, origin });
    try {
        return await work();
    } finally {
        stack.pop();
    }
}

/**
 * Keep only the keys the write actually touched — and keep them even when the note did not have
 * them, as `undefined`, because restoring has to be able to *remove* a key it added.
 */
function narrowBefore(
    before: Record<string, unknown> | undefined,
    after: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
    if (!after) return before;
    const narrowed: Record<string, unknown> = {};
    for (const key of Object.keys(after)) narrowed[key] = before?.[key];
    return narrowed;
}

/** Write one change down. Never throws: a record that breaks a write is worse than no record. */
export function recordVaultWrite(facts: VaultWriteFacts, sink: VaultWriteSink = settingsSink): void {
    if (!recording) return;
    try {
        const { writes } = sink.read();
        const entry: VaultWrite = {
            id: sink.id(),
            batch: stack.length > 0 ? stack[0].batch : sink.id(),
            at: sink.now(),
            kind: facts.kind,
            path: facts.path,
            origin: facts.origin ?? currentWriteOrigin() ?? UNATTRIBUTED,
            ...(facts.from ? { from: facts.from } : {}),
            ...(facts.after ? { after: facts.after } : {}),
            ...(facts.appended ? { appended: facts.appended } : {}),
        };
        const before = narrowBefore(facts.before, facts.after);
        if (before) entry.before = before;
        sink.write({
            writes: appendWrite(writes, entry, {
                now: entry.at,
                retentionDays: DEFAULT_WRITE_RETENTION_DAYS,
            }),
        });
    } catch (error) {
        log.warn("[writes] could not record a write", error);
    }
}
