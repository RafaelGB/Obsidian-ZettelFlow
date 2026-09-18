/**
 * What actually needs enriching (#459, epic #452) — pure.
 *
 * `enrichInlineRelations()` reads **every note in the vault** with `cachedRead` to find inline
 * `key:: [[target]]` relations and `claim::` / `source::` fields. It is O(vault content), it runs
 * after layout-ready, and it is off by default on mobile — which is the honest admission that it
 * does not scale. At fifty thousand notes it is fifty thousand reads for information that, on any
 * given launch, has changed in a handful of files.
 *
 * The pass itself is correct and stays exactly as it is. What changes is **which files it is
 * given**, and that decision is this module: a comparison between a cheap fingerprint of every
 * note now and the fingerprint of every note the last pass saw.
 *
 * The fingerprint is `mtime + size`. Not a hash: hashing means reading, and reading is the cost
 * being avoided. Size is in there because some sync clients preserve modification times, and an
 * edit that keeps its timestamp must not be invisible.
 */

export interface FileFingerprint {
    mtime: number;
    size: number;
}

/** The little this module needs to know about a file — so it never touches Obsidian. */
export interface FileStat {
    stat?: { mtime: number; size: number };
}

export interface EnrichableFile {
    path: string;
    mtime: number;
    size: number;
}

/** What one pass should do: the files worth reading, and the ones to forget. */
export interface EnrichmentPlan {
    enrich: string[];
    /** Paths that were enriched once and are no longer in the vault. */
    drop: string[];
}

/**
 * A file's fingerprint. One with no `stat` gets `size: -1`, which never matches a real file — so
 * a file we cannot measure is treated as **always changed**, never as never changed. Re-reading a
 * note needlessly costs a read; skipping one that moved costs a wrong answer.
 */
export function fingerprint(file: FileStat): FileFingerprint {
    return { mtime: file.stat?.mtime ?? 0, size: file.stat?.size ?? -1 };
}

export function sameFingerprint(
    left: FileFingerprint | undefined,
    right: FileFingerprint | undefined
): boolean {
    if (!left || !right) return false;
    return left.mtime === right.mtime && left.size === right.size;
}

/**
 * Compare what the last pass saw against what is there now.
 *
 * Order is the vault's order, so a pass stays deterministic and its progress is meaningful.
 */
export function filesToEnrich(
    known: ReadonlyMap<string, FileFingerprint>,
    current: readonly EnrichableFile[]
): EnrichmentPlan {
    const enrich: string[] = [];
    const present = new Set<string>();
    for (const file of current) {
        present.add(file.path);
        if (!sameFingerprint(known.get(file.path), { mtime: file.mtime, size: file.size })) {
            enrich.push(file.path);
        }
    }
    const drop: string[] = [];
    for (const path of known.keys()) {
        if (!present.has(path)) drop.push(path);
    }
    return { enrich, drop };
}

/**
 * Record what the pass actually finished.
 *
 * Only the files in `enriched` are remembered — a pass that was cancelled, or that skipped a file
 * because reading it threw, must not claim it, or that note stays stale until its mtime happens
 * to change again.
 */
export function rememberEnriched(
    known: ReadonlyMap<string, FileFingerprint>,
    current: readonly EnrichableFile[],
    enriched: readonly string[],
    dropped: readonly string[]
): Map<string, FileFingerprint> {
    const next = new Map(known);
    for (const path of dropped) next.delete(path);
    const done = new Set(enriched);
    for (const file of current) {
        if (done.has(file.path)) next.set(file.path, { mtime: file.mtime, size: file.size });
    }
    return next;
}
