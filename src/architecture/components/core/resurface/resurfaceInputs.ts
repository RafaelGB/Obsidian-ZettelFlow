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

/** Build the ranking candidates (every markdown file) + an active-signals factory from the cache. */
export function buildResurfaceInputs(app: App): ResurfaceInputs {
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
