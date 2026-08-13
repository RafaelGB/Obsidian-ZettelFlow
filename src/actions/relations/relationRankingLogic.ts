import type { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";

/** Options for {@link rankRelated}. */
export interface RankRelatedOptions {
    /** Cap the result to the top-K after ordering. Absent or non-positive ⇒ uncapped. */
    limit?: number;
}

/** Notes cited together weigh above notes that merely cite the same references (bibliometrics). */
const CO_CITATION_WEIGHT = 2;
const COUPLING_WEIGHT = 1;

/** A related note with its shared-context relatedness score (#154/#167). */
export interface ScoredRelated {
    path: string;
    score: number;
}

/**
 * Pure graph-structural relatedness ranking (#154, D4), score-carrying variant (#167). Scores every
 * other indexed note against `sourcePath` from shared graph context — **co-citation** (notes that
 * link to *both*) weighted above **bibliographic coupling** (notes that *both* link to) — and returns
 * the candidates as `{ path, score }` ordered by score descending, ties broken by path ascending.
 *
 * Excludes the source itself, any note already directly connected to it (an edge in either
 * direction), and any candidate whose score is 0 (no shared context). Reads only the #145
 * {@link KnowledgeModel} (`inNeighbors`/`outNeighbors`, which union every edge type — D5);
 * Obsidian-free, deterministic, never throws. An absent/unknown source yields `[]`.
 */
export function rankRelatedScored(
    model: KnowledgeModel,
    sourcePath: string,
    opts: RankRelatedOptions = {}
): ScoredRelated[] {
    if (!model.get(sourcePath)) return [];

    const sourceIn = new Set(model.inNeighbors(sourcePath));
    const sourceOut = new Set(model.outNeighbors(sourcePath));
    const connected = new Set<string>([...sourceIn, ...sourceOut]);

    const scored: ScoredRelated[] = [];
    for (const idea of model.all()) {
        const path = idea.path;
        if (path === sourcePath || connected.has(path)) continue;

        const coCitation = countShared(sourceIn, model.inNeighbors(path));
        const coupling = countShared(sourceOut, model.outNeighbors(path));
        const score = CO_CITATION_WEIGHT * coCitation + COUPLING_WEIGHT * coupling;
        if (score <= 0) continue;
        scored.push({ path, score });
    }

    scored.sort((a, b) => b.score - a.score || compareStrings(a.path, b.path));

    const limit = opts.limit;
    return limit !== undefined && limit > 0 ? scored.slice(0, limit) : scored;
}

/**
 * The paths-only view of {@link rankRelatedScored} (#154, D4) — the single relatedness metric source.
 * Same ordering and exclusions; an absent/unknown source yields `[]`.
 */
export function rankRelated(
    model: KnowledgeModel,
    sourcePath: string,
    opts: RankRelatedOptions = {}
): string[] {
    return rankRelatedScored(model, sourcePath, opts).map((entry) => entry.path);
}

function countShared(reference: Set<string>, others: string[]): number {
    let shared = 0;
    for (const value of others) if (reference.has(value)) shared++;
    return shared;
}

function compareStrings(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}
