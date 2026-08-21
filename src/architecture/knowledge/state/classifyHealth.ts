import type { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";

// Health derives from the KnowledgeModel's typed edges (#274): the model's out/in adjacency includes
// raw wikilinks AND semantic relations (`up::`, `supports`, inline `key:: [[X]]`), so a note connected
// only semantically is no longer a false orphan/dead-end. (Superseded the raw-`resolvedLinks` scan that
// #266 relocated here verbatim.) Pure and offline — no `obsidian` import, unit-tested with no vault.

export type HealthNote = {
    path: string;
    basename: string;
};

export type HealthResult = {
    orphans: HealthNote[];
    deadEnds: HealthNote[];
    totalScanned: number;
    durationMs: number;
};

/**
 * Classify every idea in the model: an **orphan** has no outgoing edge, a **dead-end** has no incoming
 * edge (self-edges excluded). Deterministic, read-only, never throws.
 */
export function classifyHealth(model: KnowledgeModel): HealthResult {
    const start = Date.now();
    const orphans: HealthNote[] = [];
    const deadEnds: HealthNote[] = [];

    for (const idea of model.all()) {
        const path = idea.path;
        const outgoing = model.outNeighbors(path).filter((p) => p !== path);
        const incoming = model.inNeighbors(path).filter((p) => p !== path);
        const basename = path.split("/").pop()?.replace(/\.md$/i, "") ?? path;
        if (outgoing.length === 0) orphans.push({ path, basename });
        if (incoming.length === 0) deadEnds.push({ path, basename });
    }

    return {
        orphans,
        deadEnds,
        totalScanned: model.size(),
        durationMs: Date.now() - start,
    };
}
