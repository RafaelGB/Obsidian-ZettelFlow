import type { KnowledgeModel } from "../model/KnowledgeModel";
import { ALL_RELATION_TYPES } from "../relations/vocabulary";
import { incomingRelations } from "../query/queries";

/** One direction/type bucket of a focus note's neighbours (targets sorted by path). */
export interface NeighborGroup {
    type: string;
    direction: "out" | "in";
    targets: string[];
}

/** The full typed neighbourhood of a focus note — the data the concept-navigation view renders. */
export interface ConceptNeighbors {
    focus: string;
    groups: NeighborGroup[];
}

/** Present types ordered by the #147 vocabulary; unknown types come after, alphabetically. */
function orderedTypes(present: Iterable<string>): string[] {
    const set = new Set(present);
    const known = ALL_RELATION_TYPES.filter((type) => set.has(type));
    const unknown = [...set].filter((type) => !ALL_RELATION_TYPES.includes(type)).sort();
    return [...known, ...unknown];
}

function groupsFor(
    direction: "out" | "in",
    byType: Map<string, Set<string>>
): NeighborGroup[] {
    return orderedTypes(byType.keys()).map((type) => ({
        type,
        direction,
        targets: [...byType.get(type)!].sort(),
    }));
}

/**
 * Pure concept-navigation data (#166, FR-6). Groups a focus note's **outgoing and incoming** typed
 * relations (the whole #147 vocabulary — `contradicts`/`question`/`link` are all walkable, unlike
 * the argument-only {@link reasoningPaths}) so the view can walk the vault like a wiki you wrote.
 *
 * Groups are ordered out-before-in, then by vocabulary order, with targets sorted by path. An
 * unknown/unindexed focus yields `{ focus, groups: [] }`. Reads only the {@link KnowledgeModel};
 * deterministic, read-only, never throws. Obsidian-free.
 */
export function conceptNeighbors(model: KnowledgeModel, path: string): ConceptNeighbors {
    const idea = model.get(path);
    if (!idea) return { focus: path, groups: [] };

    const outByType = new Map<string, Set<string>>();
    for (const relation of idea.relations) {
        const set = outByType.get(relation.type) ?? new Set<string>();
        set.add(relation.to);
        outByType.set(relation.type, set);
    }

    const inByType = new Map<string, Set<string>>();
    for (const relation of incomingRelations(model, path)) {
        const set = inByType.get(relation.type) ?? new Set<string>();
        set.add(relation.from);
        inByType.set(relation.type, set);
    }

    return { focus: path, groups: [...groupsFor("out", outByType), ...groupsFor("in", inByType)] };
}
