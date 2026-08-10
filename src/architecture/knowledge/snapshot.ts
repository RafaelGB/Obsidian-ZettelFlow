import { TFile } from "obsidian";
import { ObsidianApi } from "architecture";
import type { IdeaSnapshot, InlineField } from "./model/Idea";

/**
 * Read-only gatherer: turn a `TFile` + the metadata cache into a pure {@link IdeaSnapshot}.
 * Reads only through the {@link ObsidianApi} facade (never the `Adapter`) and performs no writes.
 *
 * Note bodies are NOT read here: #145 needs no inline fields, so `inlineFields` stays empty. #147
 * will enable body parsing (via `parseInlineFields`) when it registers a relation schema.
 */
export function gatherSnapshot(file: TFile): IdeaSnapshot {
    const metadataCache = ObsidianApi.metadataCache();
    const cache = metadataCache.getFileCache(file);
    const frontmatter: Record<string, unknown> = cache?.frontmatter ?? {};
    const tags = (cache?.tags ?? []).map((tag) => tag.tag);
    const resolved = metadataCache.resolvedLinks?.[file.path] ?? {};
    const outgoingLinks = Object.keys(resolved);
    const inlineFields: InlineField[] = [];

    return {
        path: file.path,
        title: file.basename,
        created: file.stat?.ctime ?? 0,
        modified: file.stat?.mtime ?? 0,
        frontmatter,
        tags,
        outgoingLinks,
        inlineFields,
    };
}
