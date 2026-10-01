/**
 * Resolve a dashboard's **computed fields** at the Obsidian boundary (epic #632) — the successor to
 * S6's per-panel script runner. One definition enriches the shared snapshot for every panel.
 *
 * It hands the script `rows` + a **read-only, offline `zf`** — `zf.knowledge` + vault reads only, no
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
import type { DataStoreSnapshot, SchemaField } from "dashboards/datastore";
import { runComputed, type PlainRow } from "dashboards/transform";
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

/**
 * Caches the enriched snapshot by key and supersedes stale resolves: a result is applied only if its
 * key is still the latest requested, so an out-of-order settle never paints stale enrichment.
 */
export class ComputedResolver {
    private cacheKey: string | null = null;
    private cached: DataStoreSnapshot | null = null;
    private pendingKey: string | null = null;

    constructor(private readonly deps: ResolverDeps = DEFAULT_DEPS) { }

    async resolve(
        snapshot: DataStoreSnapshot,
        computed: ComputedFields | undefined,
    ): Promise<{ snapshot: DataStoreSnapshot; error: string | null }> {
        if (!computed || !computed.enabled || !computed.code.trim()) return { snapshot, error: null };

        const key = computedKey(snapshot, computed);
        if (key === this.cacheKey && this.cached) return { snapshot: this.cached, error: null };
        this.pendingKey = key;

        const started = Date.now();
        try {
            const zf = await this.deps.loadZf();
            const fn = this.deps.compile(bindingNames(DASHBOARD_BINDINGS), computed.code);
            const run = (rows: PlainRow[]) => fn(rows, zf);
            const result = await runComputed(snapshot, run);

            if (!result.ok) {
                this.deps.record(false, Date.now() - started, result.error);
                log.error("Base dashboard computed field failed", result.error);
                return { snapshot, error: result.error };
            }
            this.deps.record(true, Date.now() - started);

            if (key !== this.pendingKey) return { snapshot, error: null }; // superseded — discard

            const byId: Record<string, SchemaField> = {};
            for (const field of result.fields) byId[field.id] = field;
            const enriched: DataStoreSnapshot = {
                schema: { fields: result.fields, byId },
                rows: result.rows,
                indexes: {},
                rowCount: result.rows.length,
                signature: `${snapshot.signature}|cf`,
            };
            this.cacheKey = key;
            this.cached = enriched;
            return { snapshot: enriched, error: null };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.deps.record(false, Date.now() - started, message);
            log.error("Base dashboard computed field resolver error", error);
            return { snapshot, error: message };
        }
    }
}
