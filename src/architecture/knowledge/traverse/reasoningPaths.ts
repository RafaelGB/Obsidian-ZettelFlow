import type { KnowledgeModel } from "../model/KnowledgeModel";

/**
 * The constructive **argument-forward** relation vocabulary (#166), in traversal precedence order:
 * an idea is *supported*, then *expanded*, then *exemplified*, then *implemented* — the arc of an
 * argument. Counter-argument (`contradicts`), open `question`, `inspired-by` and the plain `link`
 * fallback are deliberately excluded so a reasoning path reads as a single line of reasoning.
 */
export const ARGUMENT_FORWARD_RELATION_TYPES = ["supports", "expands", "example", "implements"] as const;

export type ArgumentForwardType = (typeof ARGUMENT_FORWARD_RELATION_TYPES)[number];

/** One taken edge in a reasoning path: the relation type followed and the note it reached. */
export interface PathStep {
    type: string;
    to: string;
}

/** A maximal argument chain from `start`, as the ordered forward edges taken. */
export interface Path {
    start: string;
    steps: PathStep[];
}

export interface ReasoningPathsOptions {
    /** Maximum number of steps in a returned chain (default 5). */
    maxDepth?: number;
}

const DEFAULT_MAX_DEPTH = 5;

/** The forward edges leaving `path`, grouped by {@link ARGUMENT_FORWARD_RELATION_TYPES} precedence. */
function forwardEdges(model: KnowledgeModel, path: string): PathStep[] {
    const idea = model.get(path);
    if (!idea) return [];
    const edges: PathStep[] = [];
    for (const type of ARGUMENT_FORWARD_RELATION_TYPES) {
        for (const relation of idea.relations) {
            if (relation.type === type) edges.push({ type, to: relation.to });
        }
    }
    return edges;
}

/**
 * Pure reasoning-path traversal (#166, FR-2..FR-5). From `start`, follows the argument-forward
 * relations depth-first (in precedence order) and returns every **maximal** chain — a chain ends
 * when its last note has no unvisited forward edge, or when `maxDepth` steps are reached. A note is
 * never revisited within a path (cycle-safe). An unknown/unindexed start, or a start with no forward
 * edge, yields `[]`.
 *
 * Deterministic: paths are deduped and sorted by their step sequence (relation precedence, then the
 * reached note paths). Reads only the {@link KnowledgeModel}; read-only, never throws. Obsidian-free.
 */
export function reasoningPaths(
    model: KnowledgeModel,
    start: string,
    opts: ReasoningPathsOptions = {}
): Path[] {
    if (!model.get(start)) return [];
    const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;

    const paths: Path[] = [];
    const steps: PathStep[] = [];
    const visited = new Set<string>([start]);

    const walk = (node: string): void => {
        const edges = forwardEdges(model, node).filter((edge) => !visited.has(edge.to));
        if (edges.length === 0 || steps.length >= maxDepth) {
            if (steps.length > 0) paths.push({ start, steps: [...steps] });
            return;
        }
        for (const edge of edges) {
            visited.add(edge.to);
            steps.push(edge);
            walk(edge.to);
            steps.pop();
            visited.delete(edge.to);
        }
    };
    walk(start);

    return dedupeAndSort(paths);
}

const precedenceOf = (type: string): number => ARGUMENT_FORWARD_RELATION_TYPES.indexOf(type as ArgumentForwardType);

function comparePaths(a: Path, b: Path): number {
    const shared = Math.min(a.steps.length, b.steps.length);
    for (let i = 0; i < shared; i++) {
        const byType = precedenceOf(a.steps[i].type) - precedenceOf(b.steps[i].type);
        if (byType !== 0) return byType;
        if (a.steps[i].to !== b.steps[i].to) return a.steps[i].to < b.steps[i].to ? -1 : 1;
    }
    return a.steps.length - b.steps.length;
}

function dedupeAndSort(paths: Path[]): Path[] {
    const seen = new Set<string>();
    const unique: Path[] = [];
    for (const path of paths) {
        const key = path.steps.map((step) => `${step.type}>${step.to}`).join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(path);
    }
    return unique.sort(comparePaths);
}
