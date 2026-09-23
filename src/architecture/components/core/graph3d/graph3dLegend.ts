import { COMMUNITY_COLORS, type Graph3DData, type Graph3DNode, type GapSeam } from "architecture/knowledge/state";

/**
 * **What the legend lists, and what a row flies to** (#533, epic #529).
 *
 * Pure geometry for the legend: which neighbourhoods are on screen, which seams are worth a row,
 * and the predicate each row hands to the camera. No DOM, no renderer state — so the arithmetic the
 * legend depends on is testable in a `node` environment, where the view itself cannot be mounted.
 *
 * It exists because of a **defect the measurement found**. The legend grouped its rows by community
 * **name**, and the reference vault has two different communities both called `readme`: they merged
 * into one row whose count was the sum of both, and clicking it framed **both neighbourhoods at
 * once** — two unrelated places, one camera move, no way to tell. A name is a label; a community is
 * a place. Everything here keys on the index.
 */

/** One neighbourhood on screen: what to show, and which community it is. */
export interface NeighbourhoodRow {
    /** The community's index in `communitiesOf` — its identity. */
    community: number;
    /** Its derived name (the most connected note's basename). Not unique across a vault. */
    name: string;
    /** The region it sits in. */
    region: string;
    /** How many of its notes are **on screen**, so a capped or time-sliced graph reports the truth. */
    size: number;
}

/** One seam on screen: two sides, two numbers, two colours. */
export interface SeamRow {
    a: number;
    b: number;
    labelA: string;
    labelB: string;
    gaps: number;
    links: number;
    /** The palette index of each side, so the row and the scene say the same thing (#515). */
    paletteA: number;
    paletteB: number;
}

/**
 * How many seam rows the legend shows.
 *
 * Measured against the box it lives in: the legend holds roughly 17 single-line rows before it
 * scrolls, a seam row is two lines, and the reference vault has **24** seams (630 over a generated
 * ten thousand notes). Eight two-line rows leave room for the region headings and the relation
 * legend below, and the heading says how many were left out rather than pretending eight is all of
 * them.
 */
export const SEAM_LEGEND_MAX = 8;

/**
 * The palette itself, not a copy of its length: `communityColor` wraps with the same modulo, and a
 * hardcoded size here is how a row comes to show a different colour from the node it names.
 */
const PALETTE_SIZE = COMMUNITY_COLORS.length;

/**
 * The neighbourhoods on screen, grouped nowhere and sorted by size — **keyed on the community
 * index**, which is the whole point (#533, FR-4).
 *
 * Nodes with no community (`community < 0`, an *alone* note) are counted separately: alone is a
 * state, not a neighbourhood, and there is no "there" to fly to.
 */
export function neighbourhoodRows(nodes: readonly Graph3DNode[]): { rows: NeighbourhoodRow[]; alone: number } {
    const seen = new Map<number, NeighbourhoodRow>();
    let alone = 0;
    for (const node of nodes) {
        if (node.community < 0 || !node.communityName) {
            alone++;
            continue;
        }
        const entry = seen.get(node.community);
        if (entry) entry.size++;
        else
            seen.set(node.community, {
                community: node.community,
                name: node.communityName,
                region: node.region,
                size: 1,
            });
    }
    // Size desc, then name, then **index** — so two neighbourhoods sharing a label still come back
    // in the same order every render.
    const rows = [...seen.values()].sort(
        (x, y) => y.size - x.size || (x.name < y.name ? -1 : x.name > y.name ? 1 : 0) || x.community - y.community
    );
    return { rows, alone };
}

/** Which palette colour a community gets — one rule, shared by the row and the scene. */
export function paletteOf(community: number): number {
    return ((community % PALETTE_SIZE) + PALETTE_SIZE) % PALETTE_SIZE;
}

/** The predicate that frames one neighbourhood: its own notes, and no others (#533, FR-4). */
export function belongsToCommunity(community: number): (node: Graph3DNode) => boolean {
    return (node) => node.community === community;
}

/** The predicate that frames a seam: **both** sides, so you see the space between them (FR-3). */
export function belongsToSeam(a: number, b: number): (node: Graph3DNode) => boolean {
    return (node) => node.community === a || node.community === b;
}

/**
 * The framing keys, namespaced by kind.
 *
 * `framedKey` is one string for every framable thing in the legend, so a community, a region and a
 * seam must not be able to collide — a region named `3` and community 3 are different places.
 */
export function communityFrameKey(community: number): string {
    return `community:${community}`;
}

export function regionFrameKey(region: string): string {
    return `region:${region}`;
}

export function seamFrameKey(a: number, b: number): string {
    return `seam:${Math.min(a, b)}:${Math.max(a, b)}`;
}

/**
 * Whether the legend should list **seams** instead of neighbourhoods (FR-1, FR-6).
 *
 * Only while the gap lens is on **and** the colours mean neighbourhoods: the seam rows carry the two
 * sides' palette swatches, and in the `state` colour mode those swatches would mean nothing. No new
 * toggle, no second list, no setting — the swap is a consequence of the lens you already turned on.
 */
export function legendShowsSeams(overlay: string | null, colorMode: string): boolean {
    return overlay === "gaps" && colorMode === "neighbourhood";
}

/**
 * The widest seams that fit on screen (FR-1, AC-5, AC-6).
 *
 * `gapSeams` hands them over ordered (gaps desc, links asc, labels), so this **never sorts**: it
 * takes them in order, drops a seam whose side has no note on screen — the same rule the ghost
 * edges follow, because a row you cannot fly to is a row that lies — and stops at `max`.
 */
export function seamRows(
    seams: readonly GapSeam[],
    displayed: Graph3DData,
    max: number = SEAM_LEGEND_MAX
): SeamRow[] {
    const rows: SeamRow[] = [];
    if (max <= 0 || seams.length === 0) return rows;

    const onScreen = new Set<number>();
    for (const node of displayed.nodes) {
        if (node.community >= 0) onScreen.add(node.community);
    }

    for (const seam of seams) {
        if (!onScreen.has(seam.a) || !onScreen.has(seam.b)) continue;
        rows.push({
            a: seam.a,
            b: seam.b,
            labelA: seam.labelA,
            labelB: seam.labelB,
            gaps: seam.gaps,
            links: seam.links,
            paletteA: paletteOf(seam.a),
            paletteB: paletteOf(seam.b),
        });
        if (rows.length === max) break;
    }
    return rows;
}
