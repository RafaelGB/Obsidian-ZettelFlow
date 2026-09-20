import type { Idea } from "../model/Idea";
import type { KnowledgeModel } from "../model/KnowledgeModel";

/**
 * **What your vault lets you ask** (#482, epic #481) — the values, derived from the model.
 *
 * *Ask your graph* used to hand you an empty box and a hardcoded list of twelve field names. The
 * field names are the **grammar**; they are the same in every vault on earth. What you actually
 * need to narrow anything is the **vocabulary your own notes use** — which lifecycle states you
 * keep, which relation types you write, which folders hold enough to be worth filtering to — and
 * all of it has been sitting in the {@link KnowledgeModel} the whole time.
 *
 * So this module asks the model, and it applies exactly **one rule** to what comes back:
 *
 * > A value is offered only when `0 < count < selection.length`.
 *
 * Nothing that matches nothing; nothing that matches everything. Neither can *narrow*, and a
 * filter that cannot narrow is noise. That one line carries two consequences worth stating:
 *
 * - once your selection is all `permanent`, the state group **disappears** rather than sitting
 *   there offering you the thing you already did;
 * - and **clicking can never empty your results**. Counts are conditional on the current
 *   selection, so every term offered is a term that finds something. The empty answer stops being
 *   something the interface can walk you into, and becomes purely the hand-typed case — which is
 *   where #485 puts its explanation.
 *
 * Pure: no `obsidian`, no clock, no I/O. Age is deliberately **not** a facet — `older-than:` is a
 * dial, not a list of values, and it stays a typed term.
 */

/** The facet groups, in display order. */
export type FacetId = "state" | "relation" | "incoming" | "folder" | "shape";

export interface FacetValue {
    /** The value as it appears in your vault — a state, a relation type, a folder, a shape. */
    value: string;
    /** How many of the **current selection** carry it. Never 0, and never the whole selection. */
    count: number;
    /** The query term this value contributes, ready to run. The surface never composes syntax. */
    term: string;
}

export interface Facet {
    id: FacetId;
    /** At most {@link FACET_VALUE_LIMIT}, count descending then value ascending. */
    values: FacetValue[];
    /** How many narrowing values did not fit. A number, not a "show more" mechanism. */
    hidden: number;
}

/**
 * How many values a group offers. A facet list long enough to need scrolling has stopped being an
 * answer to *what can I ask* and become a second problem.
 */
export const FACET_VALUE_LIMIT = 12;

/**
 * The bare structural predicates, offered as one group. The tokens are the ones the parser already
 * accepts, and each test mirrors that parser's — a shape offered here must mean the same thing when
 * the term is run, which is what the "every offered term finds something" guardrail proves.
 */
const SHAPES: { shape: string; holds: (idea: Idea, model: KnowledgeModel) => boolean }[] = [
    { shape: "hub", holds: (idea) => idea.maturitySignals.degree >= 5 },
    { shape: "orphan", holds: (idea, model) => model.inNeighborSet(idea.path).size === 0 },
    { shape: "leaf", holds: (idea, model) => model.outNeighborSet(idea.path).size === 0 },
    { shape: "unsourced", holds: (idea) => idea.claims.length > 0 && !idea.maturitySignals.hasSources },
];

/** The first path segment, or "" for a note living at the vault root. */
function topFolder(path: string): string {
    const slash = path.indexOf("/");
    return slash === -1 ? "" : path.slice(0, slash);
}

function bump(counts: Map<string, number>, key: string): void {
    counts.set(key, (counts.get(key) ?? 0) + 1);
}

/**
 * Turn raw counts into a group: drop everything that cannot narrow, order deterministically, cap,
 * and report what was left out. Returns `null` when nothing survives — an empty group is not a
 * group, and the caller should not have to filter after the fact.
 */
function toFacet(id: FacetId, counts: Map<string, number>, total: number, term: (value: string) => string): Facet | null {
    const narrowing = [...counts.entries()]
        .filter(([, count]) => count > 0 && count < total)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (narrowing.length === 0) return null;
    return {
        id,
        values: narrowing.slice(0, FACET_VALUE_LIMIT).map(([value, count]) => ({ value, count, term: term(value) })),
        hidden: Math.max(0, narrowing.length - FACET_VALUE_LIMIT),
    };
}

/**
 * Derive what the current selection can still be narrowed by.
 *
 * Cost is `O(N + E)` and independent of how the selection was reached. The incoming-relation
 * counts are the part that could have been quadratic: they are taken by walking the model's edges
 * **once** and testing the target against the selection, never by asking each idea who points at
 * it.
 */
export function deriveFacets(model: KnowledgeModel, selection: readonly Idea[]): Facet[] {
    const total = selection.length;
    if (total === 0) return [];

    const inSelection = new Set(selection.map((idea) => idea.path));
    const states = new Map<string, number>();
    const folders = new Map<string, number>();
    const outgoing = new Map<string, number>();
    const shapes = new Map<string, number>();

    for (const idea of selection) {
        bump(states, idea.state);
        const folder = topFolder(idea.path);
        if (folder) bump(folders, folder);
        for (const type of new Set(idea.relations.map((relation) => relation.type))) bump(outgoing, type);
        for (const { shape, holds } of SHAPES) if (holds(idea, model)) bump(shapes, shape);
    }

    // One walk of the graph's edges, counting *notes* pointed at (not edges), per relation type.
    const incomingTargets = new Map<string, Set<string>>();
    for (const idea of model.all()) {
        for (const relation of idea.relations) {
            if (!inSelection.has(relation.to)) continue;
            const targets = incomingTargets.get(relation.type);
            if (targets) targets.add(relation.to);
            else incomingTargets.set(relation.type, new Set([relation.to]));
        }
    }
    const incoming = new Map<string, number>();
    for (const [type, targets] of incomingTargets) incoming.set(type, targets.size);

    const facets = [
        toFacet("state", states, total, (value) => `state:${value}`),
        toFacet("relation", outgoing, total, (value) => `relation:${value}`),
        toFacet("incoming", incoming, total, (value) => `incoming:${value}`),
        toFacet("folder", folders, total, (value) => `folder:${value}`),
        toFacet("shape", shapes, total, (value) => value),
    ];
    return facets.filter((facet): facet is Facet => facet !== null);
}
