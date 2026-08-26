import type { KnowledgeModel } from "../model/KnowledgeModel";
import { hubs } from "../query/queries";

/** A hub and the non-hub notes that orbit it (#164). */
export interface Cluster {
    hub: string;
    degree: number;
    members: string[];
}

export interface KnowledgeMap {
    clusters: Cluster[];
    unclustered: string[];
}

export interface BuildKnowledgeMapOptions {
    hubThreshold?: number;
}

const DEFAULT_HUB_THRESHOLD = 5;
const byPath = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Pure "living knowledge map" builder (#164). Detects hubs (reusing `hubs`, degree ≥ threshold) and
 * assigns every non-hub note to its **strongest adjacent hub** — connection strength (2 = bidirectional
 * link, 1 = one-way) first, then hub degree, then hub path — leaving notes adjacent to no hub in
 * `unclustered`. Hubs are cluster centers, never members. Clusters ordered by degree desc then hub
 * path; members and `unclustered` sorted by path. Deterministic, read-only, never throws; empty model
 * ⇒ empty map. Obsidian-free.
 */
export function buildKnowledgeMap(model: KnowledgeModel, opts: BuildKnowledgeMapOptions = {}): KnowledgeMap {
    const threshold = opts.hubThreshold ?? DEFAULT_HUB_THRESHOLD;
    const hubIdeas = hubs(model, threshold);
    const hubPaths = new Set(hubIdeas.map((hub) => hub.path));
    const hubDegree = new Map(hubIdeas.map((hub) => [hub.path, hub.maturitySignals.degree]));
    const members = new Map<string, string[]>();
    for (const hub of hubIdeas) members.set(hub.path, []);

    const unclustered: string[] = [];

    for (const idea of model.all()) {
        if (hubPaths.has(idea.path)) continue; // hubs are centers, never members
        // Only the note's own adjacent hubs matter — O(degree), not O(hubs) (#302 S3). Strength is the
        // Set-membership count (one for an out-link, one for an in-link), matching the prior semantics.
        const strengthByHub = new Map<string, number>();
        for (const to of model.outNeighborSet(idea.path)) {
            if (hubPaths.has(to)) strengthByHub.set(to, (strengthByHub.get(to) ?? 0) + 1);
        }
        for (const from of model.inNeighborSet(idea.path)) {
            if (hubPaths.has(from)) strengthByHub.set(from, (strengthByHub.get(from) ?? 0) + 1);
        }

        let best: { hub: string; strength: number; degree: number } | undefined;
        for (const [hub, strength] of strengthByHub) {
            const degree = hubDegree.get(hub) ?? 0;
            const better =
                !best ||
                strength > best.strength ||
                (strength === best.strength && degree > best.degree) ||
                (strength === best.strength && degree === best.degree && hub < best.hub);
            if (better) best = { hub, strength, degree };
        }

        if (best) {
            const list = members.get(best.hub);
            if (list) list.push(idea.path);
        } else {
            unclustered.push(idea.path);
        }
    }

    const clusters: Cluster[] = hubIdeas.map((hub) => ({
        hub: hub.path,
        degree: hub.maturitySignals.degree,
        members: (members.get(hub.path) ?? []).sort(byPath),
    }));
    clusters.sort((a, b) => b.degree - a.degree || byPath(a.hub, b.hub));
    unclustered.sort(byPath);

    return { clusters, unclustered };
}
