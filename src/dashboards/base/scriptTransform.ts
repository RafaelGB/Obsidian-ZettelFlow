/**
 * Compiles and runs a panel's opt-in script transformer (epic #622, S6 #628). The function is built
 * through `buildSyncScriptFunction` — the single sanctioned function-constructor home — so the
 * dynamic-execution capability keeps one place to disclose and audit. The pure part (shape in/out,
 * fail-safe) lives in `dashboards/transform/script`; this only compiles and wires it. Fail-safe: a
 * compile or run error returns the input snapshot and surfaces via `log.error` — the Base survives.
 */
import { buildSyncScriptFunction } from "architecture/api/lib/FnConstructor";
import { recordScriptRun } from "architecture/api/lib/recordScriptRun";
import { log } from "architecture";
import type { DataStoreSnapshot, SchemaField } from "dashboards/datastore";
import { runScriptRows, type PlainRow, type ScriptRun } from "dashboards/transform";

export interface ScriptApplication {
    snapshot: DataStoreSnapshot;
    error: string | null;
}

const ORIGIN = { ref: "base-dashboard-panel", label: "Base dashboard" } as const;

export function applyScriptTransform(snapshot: DataStoreSnapshot, code: string): ScriptApplication {
    if (!code.trim()) return { snapshot, error: null };

    let run: ScriptRun;
    try {
        const compiled = buildSyncScriptFunction(["rows"], code);
        run = (rows: PlainRow[]) => compiled(rows);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        recordScriptRun({ surface: "dashboard", origin: ORIGIN, durationMs: 0, ok: false, error });
        log.error("Base dashboard script failed to compile", error);
        return { snapshot, error: message };
    }

    // Every run leaves a fact (#444): time it and record it, pass or fail.
    const started = Date.now();
    const result = runScriptRows(snapshot.rows, run);
    recordScriptRun({
        surface: "dashboard",
        origin: ORIGIN,
        durationMs: Date.now() - started,
        ok: result.ok,
        ...(result.ok ? {} : { error: result.error }),
    });
    if (!result.ok) {
        log.error("Base dashboard script failed", result.error);
        return { snapshot, error: result.error };
    }

    const byId: Record<string, SchemaField> = {};
    for (const field of result.fields) byId[field.id] = field;
    return {
        snapshot: {
            schema: { fields: result.fields, byId },
            rows: result.rows,
            indexes: {},
            rowCount: result.rows.length,
            signature: `${snapshot.signature}|script`,
        },
        error: null,
    };
}
