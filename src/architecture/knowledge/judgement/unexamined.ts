import type { KnowledgeModel } from "../model/KnowledgeModel";
import type { Judgement } from "./Judgement";

/**
 * The read side of *cognitive agency* (#339, epic #335): the ideas that **grew without your judgement**.
 *
 * This is the sentence the whole chapter exists to make sayable — *"this idea grew structurally, but you
 * have barely exercised judgement on it."* An idea qualifies when it has real structural substance and
 * **zero** recorded verdicts of any origin: an AI proposal you ruled on (#337) and a friction prompt you
 * answered (#338) both count, because both are you thinking.
 *
 * Pure, deterministic, offline. It returns **ideas**, never a number about the user: no score, no ratio,
 * no grade. The signal names an idea and invites a move; it does not judge you back.
 */

/**
 * How connected an idea must be before its lack of a verdict means anything. Below this it is simply
 * **new** — a fresh note nobody has ruled on is not neglected, and flagging it would turn the whole
 * vault into a list of failures on day one.
 */
export const UNEXAMINED_MIN_DEGREE = 3;

/** One idea that has accumulated structure but no judgement. */
export interface UnexaminedIdea {
    path: string;
    /** How connected it is — the structural growth that makes the absence notable. */
    degree: number;
}

export interface UnexaminedOptions {
    /** Cap the result (the surfaces show a handful). */
    limit?: number;
    /** Override the connectivity floor. */
    minDegree?: number;
}

/**
 * Ideas with structural substance and no recorded verdict, most-connected first then by path (stable).
 * An empty record yields an empty list rather than "every idea has failed" — absence of data is not a
 * negative verdict.
 */
export function unexaminedIdeas(
    model: KnowledgeModel,
    history: readonly Judgement[],
    opts: UnexaminedOptions = {}
): UnexaminedIdea[] {
    const minDegree = opts.minDegree ?? UNEXAMINED_MIN_DEGREE;

    const ruled = new Set<string>();
    for (const entry of history) ruled.add(entry.path);

    const out: UnexaminedIdea[] = [];
    for (const idea of model.all()) {
        const degree = idea.maturitySignals.degree;
        if (degree < minDegree || ruled.has(idea.path)) continue;
        out.push({ path: idea.path, degree });
    }

    out.sort((a, b) => b.degree - a.degree || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return opts.limit === undefined ? out : out.slice(0, opts.limit);
}
