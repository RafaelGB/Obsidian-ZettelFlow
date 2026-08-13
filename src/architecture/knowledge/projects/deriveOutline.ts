import type { KnowledgeModel } from "../model/KnowledgeModel";

/** A derived-project outline (#173): titled sections, each linking its source notes in order. */
export interface Outline {
    sections: { title: string; notes: string[] }[];
}

export interface DeriveOutlineOptions {
    /** In-selection degree at/above which a note anchors its own section (default 2). */
    hubThreshold?: number;
    /** Title of the catch-all section for notes with no adjacent anchor (default "Misc"). */
    miscTitle?: string;
}

const byPath = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Pure derived-project outliner (#173, AC-1). Restricted to the indexed `selectedPaths`, it clusters
 * the selection subgraph the #164 way — **anchors** are selected notes whose in-selection degree
 * (neighbours, in+out, that are also selected) is ≥ `hubThreshold`; each other note joins its
 * strongest-adjacent anchor (strength 2 bidirectional / 1 one-way; ties → anchor in-sel-degree desc
 * then path), else the misc section. An anchor leads its section, then members by in-sel-degree desc
 * then path; sections by anchor in-sel-degree desc then path, misc last. Every indexed selected note
 * appears exactly once; unindexed selected paths are ignored. Deterministic, read-only, never throws.
 */
export function deriveOutline(
    model: KnowledgeModel,
    selectedPaths: string[],
    opts: DeriveOutlineOptions = {}
): Outline {
    const hubThreshold = opts.hubThreshold ?? 2;
    const miscTitle = opts.miscTitle ?? "Misc";

    const selectedSet = new Set(selectedPaths.filter((path) => model.get(path) !== undefined));
    if (selectedSet.size === 0) return { sections: [] };

    const adjacency = new Map<string, Set<string>>();
    const inSelDegree = new Map<string, number>();
    for (const path of selectedSet) {
        const neighbours = new Set<string>();
        for (const n of model.outNeighbors(path)) if (selectedSet.has(n)) neighbours.add(n);
        for (const n of model.inNeighbors(path)) if (selectedSet.has(n)) neighbours.add(n);
        neighbours.delete(path);
        adjacency.set(path, neighbours);
        inSelDegree.set(path, neighbours.size);
    }
    const degree = (path: string): number => inSelDegree.get(path) ?? 0;

    const anchorSet = new Set([...selectedSet].filter((path) => degree(path) >= hubThreshold));

    const strength = (note: string, anchor: string): number =>
        (model.outNeighbors(note).includes(anchor) ? 1 : 0) + (model.inNeighbors(note).includes(anchor) ? 1 : 0);

    const members = new Map<string, string[]>();
    for (const anchor of anchorSet) members.set(anchor, []);
    const misc: string[] = [];

    for (const path of selectedSet) {
        if (anchorSet.has(path)) continue;
        const adjacentAnchors = [...(adjacency.get(path) ?? [])]
            .filter((n) => anchorSet.has(n))
            .sort((x, y) => strength(path, y) - strength(path, x) || degree(y) - degree(x) || byPath(x, y));
        if (adjacentAnchors.length === 0) misc.push(path);
        else members.get(adjacentAnchors[0])!.push(path);
    }

    const byDegreeThenPath = (x: string, y: string): number => degree(y) - degree(x) || byPath(x, y);

    const sections = [...anchorSet]
        .sort(byDegreeThenPath)
        .map((anchor) => ({
            title: model.get(anchor)?.title ?? anchor,
            notes: [anchor, ...(members.get(anchor) ?? []).sort(byDegreeThenPath)],
        }));

    if (misc.length > 0) sections.push({ title: miscTitle, notes: misc.sort(byDegreeThenPath) });

    return { sections };
}
