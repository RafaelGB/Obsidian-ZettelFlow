import type { KnowledgeModel } from "../model/KnowledgeModel";
import { pairScore } from "../discovery/discoveries";

/**
 * **Notes that share context with one note, unlinked to it** (#754 FR-5, *Connections*) — the
 * question discovery asks of the whole vault (#163), asked of one note.
 *
 * Co-citation (a third note links both) and bibliographic coupling (both link a third note), scored
 * by discovery's own `pairScore`, so the two never disagree about what *sharing context* means.
 *
 * **Degree-bounded**: it walks this note's neighbours and theirs, and never builds the vault-wide gap
 * tally — whose first build is a second and a half at ten thousand notes. A hub's fan-out is capped,
 * so the cost follows the note, not the vault. Pure and Obsidian-free.
 */

/** How many neighbours of a neighbour are looked at: a hub of thousands is sampled, not walked. */
export const SHARED_FANOUT = 64;

export interface SharedNote {
    path: string;
    score: number;
}

function take<T>(items: Iterable<T>, max: number): T[] {
    const out: T[] = [];
    for (const item of items) {
        if (out.length >= max) break;
        out.push(item);
    }
    return out;
}

export function sharedContext(
    model: KnowledgeModel,
    path: string,
    limit: number,
    ruledOut?: (a: string, b: string) => boolean
): SharedNote[] {
    if (!model.get(path) || limit <= 0) return [];
    const coCitation = new Map<string, number>();
    const coupling = new Map<string, number>();
    const bump = (counts: Map<string, number>, other: string) => {
        if (other === path) return;
        counts.set(other, (counts.get(other) ?? 0) + 1);
    };
    for (const citing of take(model.inNeighborSet(path), SHARED_FANOUT)) {
        for (const other of take(model.outNeighborSet(citing), SHARED_FANOUT)) bump(coCitation, other);
    }
    for (const cited of take(model.outNeighborSet(path), SHARED_FANOUT)) {
        for (const other of take(model.inNeighborSet(cited), SHARED_FANOUT)) bump(coupling, other);
    }

    const rows: SharedNote[] = [];
    for (const other of new Set([...coCitation.keys(), ...coupling.keys()])) {
        if (!model.get(other) || model.hasEdge(path, other) || model.hasEdge(other, path)) continue;
        if (ruledOut?.(path, other)) continue;
        const score = pairScore(coCitation.get(other) ?? 0, coupling.get(other) ?? 0);
        if (score > 0) rows.push({ path: other, score });
    }
    const title = (p: string) => model.get(p)?.title ?? p;
    rows.sort((a, b) => b.score - a.score || title(a.path).localeCompare(title(b.path), "en") || (a.path < b.path ? -1 : 1));
    return rows.slice(0, limit);
}
