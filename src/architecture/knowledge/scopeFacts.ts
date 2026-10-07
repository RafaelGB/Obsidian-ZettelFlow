/**
 * What the scope rules can see of a note (#713) — its path, its tags, its properties — read from
 * Obsidian's metadata cache. The gatherer beside the pure verdict, the way `snapshot.ts` feeds
 * `deriveIdea`: the rules never touch Obsidian, this never decides anything.
 */
import { getAllTags, type CachedMetadata } from "obsidian";
import type { ScopeFacts } from "./scope/scopeEvaluate";

/** A note's facts from its cache entry. No cache yet (a note not parsed) is a path and nothing else. */
export function scopeFactsOf(cache: CachedMetadata | null | undefined, path: string): ScopeFacts {
    if (!cache) return { path, tags: [], frontmatter: null };
    return {
        path,
        // Frontmatter and body tags alike, as Obsidian reports them.
        tags: getAllTags(cache) ?? [],
        frontmatter: cache.frontmatter ?? null,
    };
}
