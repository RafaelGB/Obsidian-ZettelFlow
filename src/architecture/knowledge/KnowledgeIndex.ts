import { Plugin, TAbstractFile, TFile } from "obsidian";
import { ObsidianApi, log } from "architecture";
import { KnowledgeModel } from "./model/KnowledgeModel";
import { deriveIdea, Idea } from "./model/Idea";
import type { KnowledgeSchemas } from "./model/schema";
import { gatherSnapshot } from "./snapshot";
import { parseInlineFields } from "./parse/inlineFields";
import { extractWikilinks, isSemanticRelationType } from "./relations";
import { isClaimOrSourceKey, isSourceKey } from "./claims";
import { measure, measureAsync } from "architecture/monitoring/measure";
import { runLongPass } from "architecture/monitoring/longPass";
import {
    fingerprint,
    filesToEnrich,
    rememberEnriched,
    type EnrichableFile,
    type FileFingerprint,
} from "./index/enrichmentPlan";
import { detectDevelopmentEvents } from "./journal/developmentEvents";
import { isPathExcluded, scopeExcludedPaths, type ScopeSettings } from "./scope/knowledgeScope";
import { DevelopmentJournal } from "architecture/plugin/journal/DevelopmentJournal";
import { ConceptualTimeline } from "architecture/plugin/timeline/ConceptualTimeline";

export type KnowledgeIndexStatus = "idle" | "building" | "ready";

/** Options for {@link KnowledgeIndex.bootstrap}. */
export interface KnowledgeIndexBootstrapOptions {
    /** When true, run the deferred inline `key::` relation enrichment pass after the initial build. */
    parseInlineRelations?: boolean;
}

/** How many notes to enrich between cooperative yields, so the deferred pass never blocks the UI. */
const ENRICH_YIELD_EVERY = 50;

/**
 * How long to wait after an edit before re-reading the note's body (#459). Typing fires
 * `modify` continuously; one pass per keystroke would be the opposite of incremental.
 */
const ENRICH_DEBOUNCE_MS = 2_000;

/**
 * A **non-sensitive** failure label for a diagnostic (#401 §XII): the error's *type*, never its
 * message, stack or any path/body it may quote. `ZettelError` and the built-ins all set `name` to the
 * class name, so this is a fixed category — safe to log even when the failing note is a private inquiry.
 */
function failureCategory(error: unknown): string {
    return error instanceof Error ? error.name : "non-error";
}

/**
 * The read-only, incremental index that models the vault as ideas — the foundation every later
 * epic layer reads from (#144). A `getInstance()` singleton behind the {@link ObsidianApi} facade.
 *
 * Guarantees: never writes to the vault (build/update are pure reads), rebuilds in memory on load
 * (decision #1 — no cache file), and updates a single entry per vault event (decision #4).
 */
export class KnowledgeIndex {
    private static instance: KnowledgeIndex | undefined;

    private readonly model = new KnowledgeModel();
    private schemas: KnowledgeSchemas = {};
    private currentStatus: KnowledgeIndexStatus = "idle";
    /**
     * The live settings host, injected at {@link bootstrap} (#374). Scope is read from **here** rather
     * than `ObsidianApi.getOwnPlugin()`, because `app.plugins.getPlugin(id)` can return `undefined` while
     * the plugin is still enabling/reloading — which made `excludedPaths()` silently return `[]` and every
     * exclusion a no-op (notes from excluded folders kept showing up in Cultivate and everywhere else).
     */
    private settingsHost: { settings: ScopeSettings } | null = null;

    /**
     * What the last enrichment pass saw, per path (#459). The full pass happens once; after
     * that only files whose `mtime`/`size` moved are read again.
     */
    private enrichedFingerprints = new Map<string, FileFingerprint>();

    /** Whether the first full pass has completed. Nothing is re-enriched before it has. */
    private firstEnrichmentDone = false;

    /** Whether inline enrichment is on at all (the setting, read once at bootstrap). */
    private enrichmentEnabled = false;

    /** The debounce behind the incremental re-pass: a burst of edits is one pass, not twenty. */
    private enrichTimer: number | undefined;

    /** Flipped by {@link cancelEnrichment}; the pass checks it at every item (#462). */
    private enrichAbort = { aborted: false };

    /** Where a running pass reports to, when a surface is watching. */
    private enrichProgress: ((progress: { done: number; total: number }) => void) | undefined;

    private constructor() {
        // singleton
    }

    public static getInstance(): KnowledgeIndex {
        if (!KnowledgeIndex.instance) {
            KnowledgeIndex.instance = new KnowledgeIndex();
        }
        return KnowledgeIndex.instance;
    }

    public get status(): KnowledgeIndexStatus {
        return this.currentStatus;
    }

    /** Read-only access to the model for the query surface and downstream consumers. */
    public getModel(): KnowledgeModel {
        return this.model;
    }

    /** Register concrete vocabularies (#146/#147/#148) before the (re)build that should use them. */
    public registerSchemas(schemas: KnowledgeSchemas): void {
        this.schemas = { ...this.schemas, ...schemas };
        // A new vocabulary changes what enrichment concludes from the same text (#459).
        this.resetEnrichment();
    }

    /**
     * The out-of-scope path prefixes (#311, extended): the user's `excludedPaths` **plus** ZettelFlow's
     * own managed system folders (flows, hook flows, JS library), which are auto-excluded so system notes
     * are never treated as knowledge.
     */
    /**
     * Inject the settings host (#374). Called by {@link bootstrap} with the live plugin; also lets scope
     * be exercised in a unit test without a running app.
     */
    public useSettingsHost(host: { settings: ScopeSettings } | null): void {
        this.settingsHost = host;
        // A different scope is a different set of notes to enrich (#459).
        this.resetEnrichment();
    }

    private excludedPaths(): readonly string[] {
        try {
            // Prefer the injected host; fall back to the global lookup only when the index was never
            // bootstrapped (e.g. an isolated test). The injected reference is what makes this reliable.
            const settings: ScopeSettings | undefined = this.settingsHost?.settings ?? ObsidianApi.getOwnPlugin()?.settings;
            return settings ? scopeExcludedPaths(settings) : [];
        } catch {
            return []; // before settings are wired (or in tests), nothing is excluded
        }
    }

    /** Whether a note counts as knowledge (#311): everything except the excluded (user + system) paths. */
    public inScope(path: string): boolean {
        return !isPathExcluded(path, this.excludedPaths());
    }

    /** Rebuild the whole index from the vault. Synchronous, read-only (decisions #1 & #4). */
    public build(): void {
        this.currentStatus = "building";
        const start = Date.now();
        const all = ObsidianApi.vault().getMarkdownFiles();
        // The single scope filter (#311): excluded notes never become ideas, so they drop out of every
        // downstream mechanism (graph, health, discovery, cultivate, home) at once.
        const inScope = all.filter((file) => this.inScope(file.path));
        // Timed through the shared instrument (#462), so Health can report what it actually
        // cost on this machine, with this vault — the same numbers the budgets assert in CI.
        const ideas: Idea[] = measure(
            "index.build",
            () => inScope.map((file) => deriveIdea(gatherSnapshot(file), this.schemas)),
            { scale: inScope.length }
        );
        this.model.build(ideas);
        this.currentStatus = "ready";
        log.debug(
            `[KnowledgeIndex] built ${ideas.length} ideas (${all.length - inScope.length} excluded) in ${Date.now() - start}ms`
        );
    }

    public onCreate(file: TAbstractFile): void {
        if (this.isMarkdown(file)) this.upsert(file);
    }

    public onModify(file: TAbstractFile): void {
        if (this.isMarkdown(file)) this.upsert(file);
    }

    public onDelete(file: TAbstractFile): void {
        if (!this.isMarkdown(file)) return;
        this.model.remove(file.path);
        this.pruneTimeline(file.path);
    }

    public onRename(file: TAbstractFile, oldPath: string): void {
        if (!this.isMarkdown(file)) return;
        // Honour scope across the move (#311): dropping/adding the note as it leaves/enters scope.
        if (!this.inScope(file.path)) {
            this.model.remove(oldPath);
            this.pruneTimeline(oldPath);
            return;
        }
        if (!this.inScope(oldPath)) {
            this.upsert(file); // entered scope from an excluded path → index it fresh
            return;
        }
        this.model.rename(oldPath, file.path);
        this.rekeyTimeline(oldPath, file.path);
    }

    /**
     * Wire the four vault events (single-entry updates) and the initial build. Events are
     * registered through `plugin.registerEvent`, so they are removed automatically on unload.
     */
    public bootstrap(plugin: Plugin, opts: KnowledgeIndexBootstrapOptions = {}): void {
        // Read scope from the plugin we are handed, not a global registry lookup that isn't ready yet (#374).
        this.useSettingsHost(plugin as unknown as { settings: ScopeSettings });
        const vault = ObsidianApi.vault();
        plugin.registerEvent(vault.on("create", (file) => this.onCreate(file)));
        plugin.registerEvent(vault.on("modify", (file) => this.onModify(file)));
        plugin.registerEvent(vault.on("delete", (file) => this.onDelete(file)));
        plugin.registerEvent(vault.on("rename", (file, oldPath) => this.onRename(file, oldPath)));
        this.enrichmentEnabled = opts.parseInlineRelations === true;
        plugin.register(() => this.cancelScheduledEnrichment());
        plugin.app.workspace.onLayoutReady(() => {
            this.build();
            // Inline `key::` relations need note bodies; enrich after the fast cache-only build so
            // load is never blocked (#147, hybrid). Off by default on mobile (set by the caller).
            if (this.enrichmentEnabled) void this.enrichInlineRelations();
        });
        // resolvedLinks may be incomplete before "resolved"; rebuild once when it fires.
        plugin.registerEvent(
            ObsidianApi.metadataCache().on("resolved", () => {
                if (this.currentStatus !== "ready") this.build();
            })
        );
    }

    /**
     * Deferred, read-only pass that enriches ideas with inline `key:: [[target]]` relations (#147)
     * and inline `claim::` / `source:: [[X]]` fields (#148) by reading note bodies via `cachedRead`.
     *
     * **Incremental since #459.** The full pass happens once; after that only files whose
     * `mtime`/`size` moved since the last pass are read. At fifty thousand notes the difference is
     * fifty thousand reads versus the handful that actually changed, which is what made this pass
     * O(vault content) and what kept it off by default on mobile.
     *
     * Batched/yielding, per-file `try/catch`, zero writes. A single pass covers both relations and
     * claims/sources.
     */
    public async enrichInlineRelations(): Promise<void> {
        const start = Date.now();
        this.enrichAbort = { aborted: false };
        const vault = ObsidianApi.vault();
        const metadataCache = ObsidianApi.metadataCache();
        const inScope: EnrichableFile[] = [];
        const byPath = new Map<string, TFile>();
        for (const file of vault.getMarkdownFiles()) {
            if (!this.inScope(file.path)) continue; // #311: excluded notes are not enriched either
            const { mtime, size } = fingerprint(file);
            inScope.push({ path: file.path, mtime, size });
            byPath.set(file.path, file);
        }

        const plan = filesToEnrich(this.enrichedFingerprints, inScope);
        const enriched: string[] = [];
        // The first pass over a large vault is genuinely long, so it yields, reports and can be
        // stopped (#462). Each note is applied whole or not at all, which is what makes stopping
        // safe: what finished is finished, and the rest was never started.
        // Timed as one thing or the other, because "the whole vault" and "the four notes you
        // touched" are different questions and Health shows both (#462).
        const full = plan.enrich.length === inScope.length && inScope.length > 0;
        const pass = await measureAsync(
            full ? "enrich.full" : "enrich.incremental",
            () => runLongPass(
            plan.enrich,
            async (path) => {
                const file = byPath.get(path);
                if (!file) return;
                const body = await vault.cachedRead(file);
                const inlineFields = parseInlineFields(body).filter(
                    (field) => isSemanticRelationType(field.key) || isClaimOrSourceKey(field.key)
                );

                const snapshot = gatherSnapshot(file);
                const resolvedTargets: Record<string, string> = { ...snapshot.resolvedTargets };
                for (const field of inlineFields) {
                    if (!isSemanticRelationType(field.key) && !isSourceKey(field.key)) continue;
                    for (const name of extractWikilinks(field.value)) {
                        if (resolvedTargets[name]) continue;
                        const dest = metadataCache.getFirstLinkpathDest(name, file.path);
                        if (dest) resolvedTargets[name] = dest.path;
                    }
                }

                // Always upsert, even when there are no inline fields left. The old pass skipped a
                // note with nothing interesting in it, which meant deleting a `supports::` line
                // left the relation in the model for the rest of the session (#459).
                this.model.upsert(deriveIdea({ ...snapshot, inlineFields, resolvedTargets }, this.schemas));
                enriched.push(path);
            },
            {
                yieldEvery: ENRICH_YIELD_EVERY,
                signal: this.enrichAbort,
                onProgress: (progress) => this.enrichProgress?.(progress),
            }
            ),
            { scale: plan.enrich.length }
        );
        if (pass.failed > 0) {
            // Never name the note or echo the raw error — a private inquiry note must not leak here (#401 §XII).
            log.error(`[KnowledgeIndex] inline relation enrichment failed for ${pass.failed} note(s)`);
        }

        // Only what was actually read is remembered: a file that threw, or one a cancellation
        // never reached, stays "changed" so the next pass tries it again.
        this.enrichedFingerprints = rememberEnriched(
            this.enrichedFingerprints,
            inScope,
            enriched,
            plan.drop
        );
        // A cancelled pass has not seen the vault, so it must not claim the first pass is done.
        if (!pass.cancelled) this.firstEnrichmentDone = true;
        const elapsed = Date.now() - start;
        log.debug(
            `[KnowledgeIndex] inline-enriched ${enriched.length} of ${inScope.length} notes in ${elapsed}ms`
        );
    }

    /** Stop the pass that is running, at its next item. Used by the Health surface (#462). */
    public cancelEnrichment(): void {
        this.enrichAbort.aborted = true;
    }

    /** Watch a running pass. One listener: there is one surface that shows it. */
    public onEnrichmentProgress(listener: ((progress: { done: number; total: number }) => void) | undefined): void {
        this.enrichProgress = listener;
    }

    /** True once the whole vault has been enriched at least once this session (#459). */
    public get hasEnrichedOnce(): boolean {
        return this.firstEnrichmentDone;
    }

    /** The setting changed. Turning it on runs the pass; turning it off stops re-passing. */
    public setEnrichmentEnabled(enabled: boolean): void {
        this.enrichmentEnabled = enabled;
        if (!enabled) this.cancelScheduledEnrichment();
    }

    /**
     * An edited note needs its body read again (#459).
     *
     * This is the reason the incremental pass exists. `upsert` rebuilds a note from the metadata
     * cache alone, which has no inline fields in it — so before this, editing a note **removed**
     * its `supports::` relations from the model until the next restart. Now the note is marked as
     * changed and a pass is scheduled; the plan makes that pass read exactly one file.
     *
     * Debounced, because typing fires `modify` continuously and a pass per keystroke would be the
     * opposite of the point.
     */
    private scheduleEnrichment(path: string): void {
        // Before the first full pass there is nothing incremental to do, and scheduling one would
        // race the pass that is already coming.
        if (!this.enrichmentEnabled || !this.firstEnrichmentDone) return;
        this.enrichedFingerprints.delete(path);
        if (this.enrichTimer) window.clearTimeout(this.enrichTimer);
        this.enrichTimer = window.setTimeout(() => {
            this.enrichTimer = undefined;
            void this.enrichInlineRelations();
        }, ENRICH_DEBOUNCE_MS);
    }

    private cancelScheduledEnrichment(): void {
        if (!this.enrichTimer) return;
        window.clearTimeout(this.enrichTimer);
        this.enrichTimer = undefined;
    }

    /**
     * Forget what the last enrichment pass saw, so the next one reads everything again. Called
     * when the scope or the schemas change, because both alter what enrichment would conclude.
     */
    public resetEnrichment(): void {
        this.enrichedFingerprints = new Map();
        this.firstEnrichmentDone = false;
    }

    private upsert(file: TFile): void {
        // Out-of-scope note (#311): make sure it isn't in the model, then stop — it isn't knowledge.
        if (!this.inScope(file.path)) {
            this.model.remove(file.path);
            return;
        }
        const before = this.model.get(file.path);
        this.model.upsert(deriveIdea(gatherSnapshot(file), this.schemas));
        // No per-note upsert log: the path is sensitive on the inquiry journey (#401 §XII), and build()
        // already reports aggregate counts. Emitting one line per edit was diagnostic noise besides.
        this.recordDevelopment(file.path, before);
        this.recordTimeline(file.path);
        // The snapshot above is cache-only and therefore has no inline fields; re-read the body
        // shortly, so an edit does not silently drop this note's `supports::` relations (#459).
        this.scheduleEnrichment(file.path);
    }

    /**
     * Capture a conceptual snapshot of this note (#168) at the same choke point as the journal.
     * Best-effort, gated on the opt-out toggle; wrapped so a timeline failure never breaks indexing.
     */
    private recordTimeline(path: string): void {
        try {
            const timeline = ConceptualTimeline.getInstance();
            if (!timeline.enabled()) return;
            const after = this.model.get(path);
            if (after) timeline.capture(after, Date.now());
        } catch (error) {
            log.error(`[KnowledgeIndex] conceptual timeline failed (${failureCategory(error)})`);
        }
    }

    /**
     * Drop a deleted note's timeline (#168). Best-effort, never breaks indexing. NOT gated on the
     * toggle — cleanup must run even when recording is off, so opting out never orphans stored data.
     */
    private pruneTimeline(path: string): void {
        try {
            ConceptualTimeline.getInstance().prune(path);
        } catch (error) {
            log.error(`[KnowledgeIndex] conceptual timeline prune failed (${failureCategory(error)})`);
        }
    }

    /** Follow a renamed note's timeline to its new path (#168). Best-effort, ungated (housekeeping). */
    private rekeyTimeline(oldPath: string, newPath: string): void {
        try {
            ConceptualTimeline.getInstance().rekey(oldPath, newPath);
        } catch (error) {
            log.error(`[KnowledgeIndex] conceptual timeline rekey failed (${failureCategory(error)})`);
        }
    }

    /**
     * Journal any development events for this note (#162). Best-effort: compares the before/after
     * (both graph-recomputed) and records when the note advanced. Wrapped so a journal failure can
     * never break indexing; the bulk `build()`/enrichment passes bypass this per-file hook.
     */
    private recordDevelopment(path: string, before: Idea | undefined): void {
        try {
            const journal = DevelopmentJournal.getInstance();
            if (!journal.enabled()) return;
            const after = this.model.get(path);
            if (after && detectDevelopmentEvents(before, after).length > 0) {
                journal.record(Date.now());
            }
        } catch (error) {
            log.error(`[KnowledgeIndex] development journal failed (${failureCategory(error)})`);
        }
    }

    private isMarkdown(file: TAbstractFile): file is TFile {
        return file instanceof TFile && file.extension === "md";
    }
}
