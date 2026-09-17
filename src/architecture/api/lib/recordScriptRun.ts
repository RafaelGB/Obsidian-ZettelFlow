import { v4 as uuid4 } from "uuid";
import { log } from "architecture/monitoring/Logger";
import { ObsidianApi } from "architecture/plugin/ObsidianAPI";
import {
    appendRun,
    DEFAULT_RETENTION_DAYS,
    summariseInput,
    type ScriptRun,
    type ScriptRunOrigin,
    type ScriptSurface,
} from "application/scripts/scriptRunLog";

/**
 * The one place a script run becomes a record (#444, epic #443).
 *
 * Five surfaces run code and each one handled its failures alone — a `Notice` here, a `log.error`
 * there, a startup toast for a library that would not load. This is the counterpart of
 * `FnConstructor`: that module is the only place code is *built*, and this is the only place a run
 * is *written down*. A guardrail test checks that the two lists match.
 *
 * Observing must never change what was observed: every path here is wrapped, and a recorder that
 * fails logs and gives up rather than turning a working script into a broken one.
 */

/** Where the log lives and what time it is — injected, so the whole thing is testable offline. */
export interface ScriptRunSink {
    read(): { runs: ScriptRun[]; retentionDays: number };
    write(state: { runs: ScriptRun[]; retentionDays: number }): void;
    now(): number;
    id(): string;
}

export interface ScriptRunFacts {
    surface: ScriptSurface;
    origin: ScriptRunOrigin;
    durationMs: number;
    ok: boolean;
    /** Whatever was thrown; only its message (and line, when there is one) is kept. */
    error?: unknown;
    /** What the script was handed — recorded by **name** only. */
    input?: Record<string, unknown>;
}

/** The plugin's settings, read lazily: at load time there is no plugin to ask yet (#374). */
const settingsSink: ScriptRunSink = {
    read: () => {
        const settings = ObsidianApi.getOwnPlugin()?.settings;
        return {
            runs: settings?.scriptLog?.runs ?? [],
            retentionDays: settings?.scriptLog?.retentionDays ?? DEFAULT_RETENTION_DAYS,
        };
    },
    write: (state) => {
        const plugin = ObsidianApi.getOwnPlugin();
        if (!plugin) return;
        plugin.settings.scriptLog = state;
        void plugin.saveSettings();
    },
    now: () => Date.now(),
    id: () => uuid4(),
};

/** The error as a record keeps it: a message, and a line when the runtime gave one. */
function describeError(error: unknown): { message: string; line?: number } {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? (error.stack ?? "") : "";
    const match = /<anonymous>:(\d+):\d+/.exec(stack);
    return { message, ...(match ? { line: Number(match[1]) } : {}) };
}

/** Write one run down. Never throws: a log that breaks a script is worse than no log. */
export function recordScriptRun(facts: ScriptRunFacts, sink: ScriptRunSink = settingsSink): void {
    try {
        const state = sink.read();
        const run: ScriptRun = {
            id: sink.id(),
            at: sink.now(),
            surface: facts.surface,
            origin: facts.origin,
            durationMs: facts.durationMs,
            ok: facts.ok,
            ...(facts.ok ? {} : { error: describeError(facts.error) }),
            ...(facts.input ? { inputKeys: summariseInput(facts.input) } : {}),
        };
        sink.write({
            runs: appendRun(state.runs, run, {
                now: run.at,
                retentionDays: state.retentionDays,
            }),
            retentionDays: state.retentionDays,
        });
    } catch (error) {
        log.warn("[scripts] could not record a script run", error);
    }
}

/**
 * Time a run and record it, whatever it does — then hand the caller exactly what it would have
 * got. The surfaces wrap their execution in this instead of remembering to record twice (once on
 * the happy path and once in the catch), which is how a surface ends up recording only its
 * successes.
 */
export async function withScriptRun<T>(
    facts: Omit<ScriptRunFacts, "durationMs" | "ok" | "error">,
    run: () => Promise<T>,
    sink: ScriptRunSink = settingsSink
): Promise<T> {
    const started = sink.now();
    try {
        const result = await run();
        recordScriptRun({ ...facts, durationMs: sink.now() - started, ok: true }, sink);
        return result;
    } catch (error) {
        recordScriptRun({ ...facts, durationMs: sink.now() - started, ok: false, error }, sink);
        throw error;
    }
}
