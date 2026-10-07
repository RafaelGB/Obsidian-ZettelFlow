/**
 * The one scope gate (#713): whether a note is knowledge, and why not, for a given settings object.
 *
 * {@link KnowledgeIndex.inScope} asks this with the plugin's settings; the few places that hold a
 * settings object of their own (the judgement and move logs) ask it with theirs. Either way it is
 * the same compiled rules and the same verdict — there is no second predicate to drift from it.
 */
import { TFile } from "obsidian";
import { ObsidianApi } from "architecture";
import { systemExcludedPaths, type ScopeSettings } from "./scope/knowledgeScope";
import { compileScope, scopeVerdict, type CompiledScope, type ScopeFacts, type ScopeVerdict } from "./scope/scopeEvaluate";
import { scopeRulesOf } from "./scope/scopeRules";
import { scopeFactsOf } from "./scopeFacts";

interface Compiled {
    scope: unknown;
    excluded: string;
    system: string;
    compiled: CompiledScope;
}

const compiledBySettings = new WeakMap<object, Compiled>();

/**
 * The settings' rules, compiled once and kept until they change. A committed edit replaces the
 * rule object (never mutates it), which is what the identity check here relies on.
 */
export function compiledScopeOf(settings: ScopeSettings): CompiledScope {
    const system = systemExcludedPaths(settings);
    const systemKey = system.join("\0");
    const excluded = (settings.excludedPaths ?? []).join("\0");
    const hit = compiledBySettings.get(settings);
    if (hit && hit.scope === settings.knowledgeScope && hit.excluded === excluded && hit.system === systemKey) {
        return hit.compiled;
    }
    const compiled = compileScope(scopeRulesOf(settings), system);
    compiledBySettings.set(settings, { scope: settings.knowledgeScope, excluded, system: systemKey, compiled });
    return compiled;
}

/** A note's facts, read from the cache only when a rule needs more than the path. */
export function factsForPath(path: string, compiled: CompiledScope, file?: TFile | null): ScopeFacts {
    if (!compiled.needsFacts) return { path, tags: [], frontmatter: null };
    try {
        const cache = ObsidianApi.metadataCache();
        const target = file ?? ObsidianApi.vault()?.getFileByPath(path);
        if (!cache || !(target instanceof TFile)) return { path, tags: [], frontmatter: null };
        return scopeFactsOf(cache.getFileCache(target), path);
    } catch {
        return { path, tags: [], frontmatter: null };
    }
}

/** In or out, and why, for `path` under these settings. */
export function scopeVerdictFor(settings: ScopeSettings, path: string, file?: TFile | null): ScopeVerdict {
    const compiled = compiledScopeOf(settings);
    return scopeVerdict(compiled, factsForPath(path, compiled, file));
}

/** Whether `path` counts as knowledge under these settings. */
export function inScopeFor(settings: ScopeSettings, path: string): boolean {
    return scopeVerdictFor(settings, path).in;
}
