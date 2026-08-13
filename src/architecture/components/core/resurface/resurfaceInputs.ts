import { App, CachedMetadata, TFile, getAllTags } from "obsidian";
import { ActiveNoteSignals, ResurfaceCandidate } from "application/notes/resurfaceRanking";

/**
 * Impure gathering for connection resurfacing — turns Obsidian's metadata cache into the pure
 * ranker's inputs. Extracted from {@link ResurfaceView} (#231 Phase 3) so both the standalone
 * resurface view and the unified Discovery view feed the same `rankResurfacedNotes` without
 * duplicating the candidate/backlink build. Reads only the cache; writes nothing.
 */

/** Tags for a file cache, with the leading `#` stripped so active/candidate sets align. */
function fileTags(cache: CachedMetadata | null): string[] {
    if (!cache) return [];
    return (getAllTags(cache) ?? []).map((tag) => (tag.startsWith("#") ? tag.slice(1) : tag));
}

/** Single-pass backlink index (target path → source paths) over the resolved-link graph. */
function buildBacklinkIndex(resolved: Record<string, Record<string, number>>): Map<string, string[]> {
    const index = new Map<string, string[]>();
    for (const source of Object.keys(resolved)) {
        for (const target of Object.keys(resolved[source])) {
            if (source === target) continue;
            const sources = index.get(target);
            if (sources) sources.push(source);
            else index.set(target, [source]);
        }
    }
    return index;
}

export interface ResurfaceInputs {
    candidates: ResurfaceCandidate[];
    /** Build the active-note signal bundle for a file, using the same resolved-link/backlink pass. */
    buildActiveSignals: (file: TFile) => ActiveNoteSignals;
}

/**
 * Cache the whole-vault build (#246 C1): candidates + backlink index depend on the vault, NOT the
 * active note, yet the views recompute on every active-note change. Rebuilding O(files) each time is
 * heavy on large vaults, so memoize briefly — reused within `CACHE_TTL_MS` unless the markdown-file
 * count changed (a cheap add/remove signal). Suggestions tolerate a few seconds of link/content
 * staleness; a real add/remove invalidates immediately.
 */
const CACHE_TTL_MS = 4000;
let cache: { inputs: ResurfaceInputs; at: number; fileCount: number } | null = null;

/** Test-only: drop the memo so unit tests don't leak state across cases. */
export function clearResurfaceInputsCache(): void {
    cache = null;
}

/** Build the ranking candidates (every markdown file) + an active-signals factory from the cache. */
export function buildResurfaceInputs(app: App): ResurfaceInputs {
    const fileCount = app.vault.getMarkdownFiles().length;
    const now = Date.now();
    if (cache && now - cache.at < CACHE_TTL_MS && cache.fileCount === fileCount) {
        return cache.inputs;
    }
    const inputs = buildResurfaceInputsUncached(app);
    cache = { inputs, at: now, fileCount };
    return inputs;
}

function buildResurfaceInputsUncached(app: App): ResurfaceInputs {
    const resolved = app.metadataCache.resolvedLinks;
    const backlinkIndex = buildBacklinkIndex(resolved);
    const cache = app.metadataCache;

    const candidates: ResurfaceCandidate[] = app.vault.getMarkdownFiles().map((file) => ({
        path: file.path,
        basename: file.basename,
        tags: fileTags(cache.getFileCache(file)),
        outgoingLinks: Object.keys(resolved[file.path] ?? {}),
        backlinks: backlinkIndex.get(file.path) ?? [],
        lastOpenedOrModified: file.stat.mtime,
    }));

    const buildActiveSignals = (file: TFile): ActiveNoteSignals => ({
        path: file.path,
        tags: fileTags(cache.getFileCache(file)),
        outgoingLinks: Object.keys(resolved[file.path] ?? {}),
        backlinks: backlinkIndex.get(file.path) ?? [],
    });

    return { candidates, buildActiveSignals };
}
