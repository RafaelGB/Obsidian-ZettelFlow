import type { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import type { NearbyRow } from "./noteCompanion";

/**
 * The note's neighbourhood (#643, epic #639) — what it links to and what links to it, as data the
 * companion draws as an ego graph and as a list.
 *
 * Degree-bounded: it reads the note's own adjacency and its neighbours' own relations, never the
 * vault, so its cost follows the note's link count (FR-15). Pure and Obsidian-free.
 */

/** How a neighbour is drawn. The other semantic types are drawn as plain links (decision 1). */
export type NeighbourClass = "contradicts" | "supports" | "example" | "link";

export interface Neighbour {
    path: string;
    title: string;
    cls: NeighbourClass;
    /** It links to this note. */
    inbound: boolean;
    /** This note links to it. */
    outbound: boolean;
    /** The strongest relation type this note → it (the list's chip), when outbound. */
    outType?: string;
    /** The strongest relation type it → this note, when inbound. */
    inType?: string;
}

export interface NearNote {
    path: string;
    title: string;
}

export interface NoteNeighbourhood {
    /** Every neighbour, best first: relation, then two-way, then title (FR-6). */
    neighbours: Neighbour[];
    /** Up to three notes near it that it does not link with (FR-4). */
    near: NearNote[];
    linksIn: Neighbour[];
    linksOut: Neighbour[];
}

/** How many near-but-unlinked notes the outer ring holds. */
export const NEAR_RING_SIZE = 3;

const STRONG: Record<string, number> = { contradicts: 0, supports: 1, example: 2 };
const LINK = "link";

/** Lower is stronger: contradicts, supports, example, any other typed relation, a plain link. */
function typeRank(type: string | undefined): number {
    if (type === undefined) return 5;
    return STRONG[type] ?? (type === LINK ? 4 : 3);
}

function strongest(types: Iterable<string>): string | undefined {
    let best: string | undefined;
    for (const type of types) if (typeRank(type) < typeRank(best)) best = type;
    return best;
}

/**
 * Whether `other` counts as a neighbour of `path`: another note the model knows. That drops a
 * self-link, a link to a note that does not exist and an attachment — none of them is a note you
 * could open from the graph. The header's counts go through the same test, so they always agree.
 */
export function isNoteNeighbour(model: KnowledgeModel, path: string, other: string): boolean {
    return other !== path && model.get(other) !== undefined;
}

/** What a node is called: the note's title, never with its file extension. */
function title(model: KnowledgeModel, path: string): string {
    const name = model.get(path)?.title || (path.split("/").pop() ?? path);
    return name.replace(/\.md$/i, "");
}

export function noteNeighbourhood<R>(
    model: KnowledgeModel,
    path: string,
    nearby: readonly NearbyRow<R>[]
): NoteNeighbourhood {
    const idea = model.get(path);
    if (!idea) return { neighbours: [], near: [], linksIn: [], linksOut: [] };

    const out = new Map<string, string[]>();
    for (const relation of idea.relations) {
        if (!isNoteNeighbour(model, path, relation.to)) continue;
        const types = out.get(relation.to) ?? [];
        types.push(relation.type);
        out.set(relation.to, types);
    }
    const inbound = new Map<string, string[]>();
    for (const from of model.inNeighborSet(path)) {
        if (!isNoteNeighbour(model, path, from)) continue;
        const types = (model.get(from)?.relations ?? []).filter((r) => r.to === path).map((r) => r.type);
        inbound.set(from, types.length > 0 ? types : [LINK]);
    }

    const neighbours: Neighbour[] = [];
    for (const other of new Set([...out.keys(), ...inbound.keys()])) {
        const outType = out.has(other) ? strongest(out.get(other)!) : undefined;
        const inType = inbound.has(other) ? strongest(inbound.get(other)!) : undefined;
        const best = typeRank(outType) <= typeRank(inType) ? outType : inType;
        neighbours.push({
            path: other,
            title: title(model, other),
            cls: best && best in STRONG ? (best as NeighbourClass) : "link",
            inbound: inbound.has(other),
            outbound: out.has(other),
            ...(outType !== undefined ? { outType } : {}),
            ...(inType !== undefined ? { inType } : {}),
        });
    }

    const rank = (n: Neighbour) => Math.min(typeRank(n.outType), typeRank(n.inType));
    neighbours.sort(
        (a, b) =>
            rank(a) - rank(b) ||
            Number(b.inbound && b.outbound) - Number(a.inbound && a.outbound) ||
            a.title.localeCompare(b.title, "en") ||
            a.path.localeCompare(b.path, "en")
    );

    const known = new Set(neighbours.map((n) => n.path));
    const near = nearby
        .filter((row) => row.path !== path && !known.has(row.path))
        .slice(0, NEAR_RING_SIZE)
        .map((row) => ({ path: row.path, title: title(model, row.path) }));

    return {
        neighbours,
        near,
        linksIn: neighbours.filter((n) => n.inbound),
        linksOut: neighbours.filter((n) => n.outbound),
    };
}
