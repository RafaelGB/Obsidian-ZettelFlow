/**
 * Pure membership resolution for the map-of-content (MOC) builder.
 *
 * Kept free of file-body reads: the caller gathers a snapshot of candidate notes from the
 * metadata cache ({@link MemberSource}) and this function filters/sorts it, so it is a pure
 * function of its inputs and fully unit-testable.
 */

/** Filter for the query selection mode. Both fields are optional and AND-combined. */
export type MocQuery = { tag?: string; folder?: string };

/** A note that qualifies for the map. */
export type MocCandidate = { path: string; title: string };

/** A candidate note snapshot taken from the metadata cache. */
export type MemberSource = { path: string; title: string; tags: string[] };

/**
 * Resolves the members of a map from a metadata-cache snapshot.
 *
 *  - `query.tag` matches a note that carries the tag (case-insensitive, with or without the
 *    leading `#`).
 *  - `query.folder` matches a note whose path lives under that folder.
 *  - When both are given they are AND-combined; when neither is given every source qualifies.
 *  - `excludePath` (the MOC note itself) is always dropped.
 *
 * Results are sorted by title via `localeCompare`.
 */
export function resolveMembers(
    sources: MemberSource[],
    query: MocQuery,
    excludePath?: string
): MocCandidate[] {
    const normalizedTag = normalizeTag(query.tag);
    const folderPrefix = normalizeFolder(query.folder);

    const result: MocCandidate[] = [];
    for (const source of sources) {
        if (excludePath !== undefined && source.path === excludePath) {
            continue;
        }
        if (normalizedTag !== undefined) {
            const hasTag = source.tags.some((tag) => normalizeTag(tag) === normalizedTag);
            if (!hasTag) {
                continue;
            }
        }
        if (folderPrefix !== undefined && !source.path.startsWith(folderPrefix)) {
            continue;
        }
        result.push({ path: source.path, title: source.title });
    }

    result.sort((a, b) => a.title.localeCompare(b.title));
    return result;
}

function normalizeTag(tag?: string): string | undefined {
    if (tag === undefined) {
        return undefined;
    }
    const trimmed = tag.trim();
    if (trimmed === "") {
        return undefined;
    }
    const withoutHash = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
    return withoutHash.toLowerCase();
}

function normalizeFolder(folder?: string): string | undefined {
    if (folder === undefined) {
        return undefined;
    }
    const trimmed = folder.trim().replace(/\/+$/, "");
    if (trimmed === "") {
        return undefined;
    }
    return `${trimmed}/`;
}
