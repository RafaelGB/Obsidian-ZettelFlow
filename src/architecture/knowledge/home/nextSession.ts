import type { KnowledgeModel } from "../model/KnowledgeModel";
import { STATE_FACTOR } from "actions/calculateMaturity/maturityLogic";

/** The single most valuable note to work on next (#172). */
export interface NextSession {
    path: string;
    reason: "develop-hub";
}

/**
 * Pure "next recommended session" heuristic (#172, AC-2). Returns the highest-**leverage** note — one
 * that is well-connected (`degree`) yet under-developed (low #153 `STATE_FACTOR`), where a working
 * session pays off most: `score = degree * (1 - (STATE_FACTOR[state] ?? 0))`. Ties break by path
 * ascending. Returns `null` when no note scores above 0 (empty / all-isolated / all-evergreen).
 * Reads only the {@link KnowledgeModel}; deterministic, read-only, never throws. Obsidian-free.
 */
export function nextSession(model: KnowledgeModel): NextSession | null {
    let best: { path: string; score: number } | null = null;
    for (const idea of model.all()) {
        const score = idea.maturitySignals.degree * (1 - (STATE_FACTOR[idea.state] ?? 0));
        if (score <= 0) continue;
        if (!best || score > best.score || (score === best.score && idea.path < best.path)) {
            best = { path: idea.path, score };
        }
    }
    return best ? { path: best.path, reason: "develop-hub" } : null;
}
