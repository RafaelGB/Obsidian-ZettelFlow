import type { Source } from "architecture/knowledge/model/Idea";
import type { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import { sourcesByReferenceCount } from "architecture/knowledge/query/queries";

/** Options for {@link findSources}. */
export interface FindSourcesOptions {
    /** Cap the result to the top-K. Absent or non-positive ⇒ 5. */
    limit?: number;
}

const DEFAULT_LIMIT = 5;

function sourceKey(source: Source): string {
    return source.kind === "link" ? `link:${source.ref}` : `text:${source.ref.trim().toLowerCase()}`;
}

/**
 * Pure vault-local source suggestion (#155, FR-5/D5). For an **unsourced** target note, returns a
 * deterministically-ranked list of candidate {@link Source}s already present in the model — every
 * source the vault already cites (`sourcesByReferenceCount`, #145). Sources cited by the target's
 * graph **neighbours** rank first (topically relevant), then by reference count descending, ties
 * broken by source key ascending, capped to the top-K. An already-sourced / unknown target or an
 * empty model ⇒ `[]`. Read-only, offline, deterministic, never throws. Obsidian-free.
 */
export function findSources(
    model: KnowledgeModel,
    path: string,
    opts: FindSourcesOptions = {}
): Source[] {
    const target = model.get(path);
    if (!target || target.maturitySignals.hasSources) return [];

    const neighbourKeys = new Set<string>();
    const neighbours = new Set<string>([...model.inNeighbors(path), ...model.outNeighbors(path)]);
    for (const neighbour of neighbours) {
        const idea = model.get(neighbour);
        if (!idea) continue;
        for (const claim of idea.claims) {
            for (const source of claim.sources) neighbourKeys.add(sourceKey(source));
        }
    }

    const limit = opts.limit !== undefined && opts.limit > 0 ? Math.floor(opts.limit) : DEFAULT_LIMIT;
    const ranked = sourcesByReferenceCount(model).map(({ source, count }) => ({
        source,
        count,
        key: sourceKey(source),
        neighbour: neighbourKeys.has(sourceKey(source)),
    }));
    ranked.sort(
        (a, b) =>
            Number(b.neighbour) - Number(a.neighbour) ||
            b.count - a.count ||
            (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
    );
    return ranked.slice(0, limit).map((entry) => entry.source);
}
