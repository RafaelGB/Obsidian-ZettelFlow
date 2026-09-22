import type { Graph3DData } from "architecture/knowledge/state";

/**
 * Which gaps the scene draws (#532, epic #529) — pure, so the rule is testable without a scene.
 *
 * A **ghost edge** is a line where a link could be: two notes that share graph context and were
 * never linked. It is not in `Graph3DData` and never will be, which is why the selection lives
 * here rather than as a filter over the graph.
 */
export interface GhostEdge {
    a: string;
    b: string;
    score: number;
}

export interface GhostSelection {
    /** The lines to draw, strongest first. */
    edges: GhostEdge[];
    /** The notes at their ends — what the lens lights while everything else dims. */
    endpoints: Set<string>;
}

/**
 * How many ghost edges the scene draws at once. **Thirty**, measured rather than felt.
 *
 * On the reference vault (94 notes, 100 real links on screen) all 217 gaps are drawable, so the
 * number is purely a question of how much of the picture is made of things that do not exist:
 *
 * | cap | reference vault | ten thousand notes |
 * |---|---|---|
 * | 60 | 60 % as many lines as the real links, ~40 of them score 1 | 4 % |
 * | 30 | 30 % | 2 % |
 *
 * A fixed 60 dominates the small picture and disappears in the large one; 30 reads as an overlay
 * on both. The alternative — a score floor — was measured and rejected by the epic: a floor of 2
 * keeps 20 of the reference vault's 217 gaps and deletes the widest seam, whose 14 gaps are all
 * score 1. And a cap expressed as a *fraction of the real links* would be an invented metric
 * (§XI); this is one integer, and the status line states the total beside it so nobody has to
 * guess what was left out.
 */
export const GAP_DRAW_MAX = 30;

/**
 * The strongest gaps that fit on screen.
 *
 * `strongest` arrives ordered from `topGaps` (score desc, then path), so this **never sorts**: it
 * keeps that order, drops any pair with a note that is not currently rendered, and stops at `max`.
 * Dropping is what makes the lens correct for free under the time-lapse cursor — a gap to a note
 * that does not exist yet is not drawn, and nothing about the cursor needs to know what a gap is.
 *
 * Pure: never mutates `displayed` or `strongest`, touches no node position, and reads nothing but
 * the ids. Paint is the renderer's business; this only decides what.
 */
export function selectGhosts(
    displayed: Graph3DData,
    strongest: readonly GhostEdge[],
    max: number = GAP_DRAW_MAX
): GhostSelection {
    const edges: GhostEdge[] = [];
    const endpoints = new Set<string>();
    if (max <= 0) return { edges, endpoints };

    const onScreen = new Set(displayed.nodes.map((node) => node.id));
    for (const gap of strongest) {
        if (edges.length >= max) break;
        if (!onScreen.has(gap.a) || !onScreen.has(gap.b)) continue;
        edges.push({ a: gap.a, b: gap.b, score: gap.score });
        endpoints.add(gap.a);
        endpoints.add(gap.b);
    }
    return { edges, endpoints };
}

/** The key a drawn ghost is held under, so a line survives a redraw instead of being rebuilt. */
export function ghostKey(edge: GhostEdge): string {
    return `${edge.a}\u0000${edge.b}`;
}
