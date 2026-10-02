/**
 * Resolve a dashboard's **computed fields** at the Obsidian boundary (epic #632) — the successor to
 * S6's per-panel script runner. One definition enriches the shared snapshot for every panel.
 *
 * It hands the script each note's `row` (+ `index`, `rows`) and a **read-only, offline `zf`** — `zf.knowledge` + vault reads only, no
 * `ai`/network and no `app`/writes, so "a panel never writes the vault" is a property of the binding
 * set (§XII). The function is built through the single `buildAsyncScriptFunction` home and every run
 * is recorded via `recordScriptRun(dashboard)`. The resolve is **async and off the render path**:
 * render draws the un-enriched snapshot immediately; this caches the enriched one by the snapshot
 * signature, supersedes stale runs, and fails safe to the un-enriched snapshot on any error.
 */
import { buildAsyncScriptFunction, fnsManager } from "architecture/api/lib/FnConstructor";
import { recordScriptRun } from "architecture/api/lib/recordScriptRun";
import { DASHBOARD_BINDINGS, bindingNames } from "architecture/api/bindings/scriptBindings";
import { log } from "architecture";
import type { DataStoreSnapshot, Row, SchemaField } from "dashboards/datastore";
import { runComputed, type ComputedWarning, type PlainRow } from "dashboards/transform";
import type { ComputedFields } from "dashboards/panels";

/** The read-only, offline slice of `zf` a computed field may use: knowledge + vault reads. */
export interface OfflineZf {
    knowledge: Record<string, unknown>;
    internal: { vault: Record<string, unknown> };
}

/** Project the full `zf` down to its offline, read-only surface — dropping `ai`/network and `external`. */
export function offlineZf(full: { knowledge: Record<string, unknown>; internal: { vault: Record<string, unknown> } }): OfflineZf {
    return { knowledge: full.knowledge, internal: { vault: full.internal.vault } };
}

export interface ResolverDeps {
    loadZf: () => Promise<OfflineZf>;
    compile: (argNames: string[], body: string) => (...args: unknown[]) => Promise<unknown>;
    record: (ok: boolean, durationMs: number, error?: string) => void;
}

const ORIGIN = { ref: "base-dashboard-computed", label: "Base dashboard" } as const;

const DEFAULT_DEPS: ResolverDeps = {
    loadZf: async () => offlineZf(await fnsManager.getFns()),
    compile: (argNames, body) => buildAsyncScriptFunction(argNames, body),
    record: (ok, durationMs, error) =>
        recordScriptRun({ surface: "dashboard", origin: ORIGIN, durationMs, ok, ...(ok ? {} : { error }) }),
};

function computedKey(snapshot: DataStoreSnapshot, computed: ComputedFields): string {
    return `${snapshot.signature}|cf:${computed.enabled ? "1" : "0"}:${computed.code}`;
}

/** What one evaluation produced: the enriched snapshot plus what it added and which notes it skipped. */
export type ComputedOutcome =
    | {
        ok: true;
        snapshot: DataStoreSnapshot;
        added: SchemaField[];
        skipped: number;
        warnings: ComputedWarning[];
    }
    | { ok: false; error: string };

export interface ResolvedComputed {
    snapshot: DataStoreSnapshot;
    error: string | null;
    /** Notes the script could not compute (their new fields are empty), and why. */
    skipped: number;
    warnings: ComputedWarning[];
}

const NOTHING_SKIPPED = { skipped: 0, warnings: [] as ComputedWarning[] };

function enrichedSnapshot(base: DataStoreSnapshot, fields: SchemaField[], rows: Row[]): DataStoreSnapshot {
    const byId: Record<string, SchemaField> = {};
    for (const field of fields) byId[field.id] = field;
    return { schema: { fields, byId }, rows, indexes: {}, rowCount: rows.length, signature: `${base.signature}|cf` };
}

/**
 * Caches the enriched snapshot by key and supersedes stale resolves: a result is applied only if its
 * key is still the latest requested, so an out-of-order settle never paints stale enrichment.
 */
export class ComputedResolver {
    private cacheKey: string | null = null;
    private cached: ResolvedComputed | null = null;
    private pendingKey: string | null = null;

    constructor(private readonly deps: ResolverDeps = DEFAULT_DEPS) { }

    /**
     * Compile and run `code` over `snapshot` once — **uncached**, so the editor's preview always shows
     * what the code in front of you does. Every run is recorded in the script run log.
     */
    async evaluate(snapshot: DataStoreSnapshot, code: string): Promise<ComputedOutcome> {
        const started = Date.now();
        try {
            const zf = await this.deps.loadZf();
            const fn = this.deps.compile(bindingNames(DASHBOARD_BINDINGS), code);
            const run = (row: PlainRow, index: number, rows: PlainRow[]) => fn(row, index, rows, zf);
            const result = await runComputed(snapshot, run);
            if (!result.ok) {
                this.deps.record(false, Date.now() - started, result.error);
                return result;
            }
            this.deps.record(true, Date.now() - started);
            return {
                ok: true,
                snapshot: enrichedSnapshot(snapshot, result.fields, result.rows),
                added: result.added,
                skipped: result.skipped,
                warnings: result.warnings,
            };
        } catch (error) {
            // A syntax error surfaces here, from compile — the same fail-safe path as a runtime throw.
            const message = error instanceof Error ? error.message : String(error);
            this.deps.record(false, Date.now() - started, message);
            return { ok: false, error: message };
        }
    }

    async resolve(snapshot: DataStoreSnapshot, computed: ComputedFields | undefined): Promise<ResolvedComputed> {
        if (!computed || !computed.enabled || !computed.code.trim()) {
            return { snapshot, error: null, ...NOTHING_SKIPPED };
        }
        const key = computedKey(snapshot, computed);
        if (key === this.cacheKey && this.cached) return this.cached;
        this.pendingKey = key;

        const outcome = await this.evaluate(snapshot, computed.code);
        if (!outcome.ok) {
            log.error("Base dashboard computed field failed", outcome.error);
            return { snapshot, error: outcome.error, ...NOTHING_SKIPPED };
        }
        if (key !== this.pendingKey) return { snapshot, error: null, ...NOTHING_SKIPPED }; // superseded

        const resolved: ResolvedComputed = {
            snapshot: outcome.snapshot,
            error: null,
            skipped: outcome.skipped,
            warnings: outcome.warnings,
        };
        this.cacheKey = key;
        this.cached = resolved;
        return resolved;
    }
}
