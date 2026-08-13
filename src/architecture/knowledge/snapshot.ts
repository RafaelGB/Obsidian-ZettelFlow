import { TFile } from "obsidian";
import { ObsidianApi } from "architecture";
import type { IdeaSnapshot, InlineField } from "./model/Idea";
import { extractWikilinks, isSemanticRelationType } from "./relations";
import { isSourceKey } from "./claims";

/**
 * Read-only gatherer: turn a `TFile` + the metadata cache into a pure {@link IdeaSnapshot}.
 * Reads only through the {@link ObsidianApi} facade (never the `Adapter`) and performs no writes.
 *
 * Note bodies are NOT read here (synchronous, cache-only): `inlineFields` stays empty and only
 * frontmatter relation targets are resolved. Inline `key::` relations are enriched later by the
 * deferred pass in `KnowledgeIndex` (#147, decision: hybrid).
 */
export function gatherSnapshot(file: TFile): IdeaSnapshot {
    const metadataCache = ObsidianApi.metadataCache();
    const cache = metadataCache.getFileCache(file);
    const frontmatter: Record<string, unknown> = cache?.frontmatter ?? {};
    const tags = (cache?.tags ?? []).map((tag) => tag.tag);
    const resolved = metadataCache.resolvedLinks?.[file.path] ?? {};
    const outgoingLinks = Object.keys(resolved);
    const inlineFields: InlineField[] = [];
    const resolvedTargets = resolveFrontmatterTargets(file, frontmatter);

    return {
        path: file.path,
        title: file.basename,
        created: file.stat?.ctime ?? 0,
        modified: file.stat?.mtime ?? 0,
        frontmatter,
        tags,
        outgoingLinks,
        inlineFields,
        resolvedTargets,
    };
}

/**
 * Resolve wikilink names under semantic relation keys (#147) and source keys (#148) to vault paths
 * (frontmatter only, synchronous).
 */
function resolveFrontmatterTargets(
    file: TFile,
    frontmatter: Record<string, unknown>
): Record<string, string> {
    const metadataCache = ObsidianApi.metadataCache();
    const targets: Record<string, string> = {};
    for (const [key, value] of Object.entries(frontmatter)) {
        if (!isSemanticRelationType(key) && !isSourceKey(key)) continue;
        for (const name of extractWikilinks(value)) {
            if (targets[name]) continue;
            const dest = metadataCache.getFirstLinkpathDest(name, file.path);
            if (dest) targets[name] = dest.path;
        }
    }
    return targets;
}
