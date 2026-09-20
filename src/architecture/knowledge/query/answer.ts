import type { Idea } from "../model/Idea";
import type { KnowledgeModel } from "../model/KnowledgeModel";
import { runGraphQuery } from "./graphQuery";
import { asSelection, toQuery } from "./selection";

/**
 * **An answer that explains itself** (#485, epic #481).
 *
 * Two questions the surface used to refuse.
 *
 * *Why is this row here?* — every row read `state · degree`, whatever you had asked about. Filter
 * by sources and the one fact you cared about was the one fact missing. {@link rowFacts} derives
 * what a row carries **from the selection**, so the answer talks about the question.
 *
 * *Which of my terms emptied this?* — the surface said "no notes match" and stopped, while knowing
 * perfectly well. {@link explainEmpty} narrows one term at a time and names the first one that
 * reached zero, with the counts either side.
 *
 * Everything here is **mechanical output** under
 * [§XII](../../../../docs/development/constitution.md): a count, a derived per-note fact, an
 * arithmetic narrowing. The line it must not cross is advice. *"`folder:Reading` took it from 43
 * to 0"* is a fact about your selection; *"try removing that term"* is a verdict about what you
 * should do, and the interface does not get to have one. There is nothing to decide here anyway —
 * there is a query to edit, and you can already edit it.
 *
 * Pure: no `obsidian`, no clock of its own.
 */

/** Which term emptied the selection, and the counts immediately either side of it. */
export interface EmptyExplanation {
    term: string;
    /** How many the selection held before this term was applied. */
    before: number;
    /** Always 0 — kept explicit so the sentence the surface builds reads as a pair. */
    after: number;
}

/**
 * Narrow left to right and stop at the first zero.
 *
 * Returns `null` — deliberately silent rather than confidently wrong — when the selection is not
 * empty, when there are no terms, when any prefix fails to parse (a broken query is not an
 * emptying filter, and the surface already says so), and when a term is not a plain conjunct. A
 * disjunction has no single culprit.
 *
 * Only ever called on an empty result, so the one pass per term is paid exactly when there is
 * nothing else to do.
 */
export function explainEmpty(
    model: KnowledgeModel,
    terms: readonly string[],
    now?: number
): EmptyExplanation | null {
    if (terms.length === 0) return null;
    if (terms.some((term) => asSelection(term) === null)) return null;

    let before = model.all().length;
    for (let index = 0; index < terms.length; index++) {
        const result = runGraphQuery(model, toQuery(terms.slice(0, index + 1)), now);
        if (result.error) return null;
        if (result.matches.length === 0) return { term: terms[index], before, after: 0 };
        before = result.matches.length;
    }
    return null;
}

/** One fact a row carries: an i18n key, an optional argument for it, and the value itself. */
export interface RowFact {
    key: string;
    /** Names the thing the fact is about when the key alone cannot — a relation type. */
    arg?: string;
    value: string;
}

/** Four facts is a row; six is a paragraph, and the graph lens is where breadth belongs. */
export const ROW_FACT_LIMIT = 4;

/** What a row says when you have asked nothing in particular. */
const DEFAULT_FACTS = ["state", "degree"] as const;

const YES = "✓";
const NO = "—";

function topFolder(path: string): string {
    const slash = path.indexOf("/");
    return slash === -1 ? "" : path.slice(0, slash);
}

/** The term, stripped of its negation: the fact a row shows is the same either way. */
function bare(term: string): string {
    const trimmed = term.trim();
    return trimmed.startsWith("!") ? trimmed.slice(1).trim() : trimmed;
}

/** One term → the fact it makes worth showing, or `null` when it has no per-note answer. */
function factFor(term: string, idea: Idea, model: KnowledgeModel): RowFact | null {
    const text = bare(term);
    const colon = text.indexOf(":");
    const keyword = (colon === -1 ? text : text.slice(0, colon)).toLowerCase();
    const arg = colon === -1 ? "" : text.slice(colon + 1).trim();

    if (/^degree\s*(>=|<=|>|<|=)/i.test(text)) {
        return { key: "explore_fact_degree", value: String(idea.maturitySignals.degree) };
    }
    switch (keyword) {
        case "state":
            return { key: "explore_fact_state", value: idea.state };
        // `degree` bare is not a query term — it is how DEFAULT_FACTS asks for the same fact.
        case "hub":
        case "degree":
            return { key: "explore_fact_degree", value: String(idea.maturitySignals.degree) };
        case "unsourced":
            return { key: "explore_fact_sources", value: idea.maturitySignals.hasSources ? YES : NO };
        case "orphan":
            return { key: "explore_fact_linked_from", value: String(model.inNeighborSet(idea.path).size) };
        case "leaf":
            return { key: "explore_fact_links_out", value: String(model.outNeighborSet(idea.path).size) };
        case "folder":
            return { key: "explore_fact_folder", value: topFolder(idea.path) };
        case "relation": {
            const type = (arg.split(":")[0] ?? "").toLowerCase();
            if (!type) return null;
            const count = idea.relations.filter((relation) => relation.type.toLowerCase() === type).length;
            return { key: "explore_fact_relation", arg: type, value: String(count) };
        }
        case "incoming": {
            const type = (arg.split(":")[0] ?? "").toLowerCase();
            if (!type) return null;
            let count = 0;
            for (const other of model.all()) {
                if (other.relations.some((r) => r.to === idea.path && r.type.toLowerCase() === type)) count++;
            }
            return { key: "explore_fact_incoming", arg: type, value: String(count) };
        }
        // `about:`, `older-than:` and `newer-than:` have no per-note fact worth a column: the
        // first is already visible in the title, the other two are the same date twice.
        default:
            return null;
    }
}

/**
 * The facts a row should carry, derived from the terms in the selection — so the answer talks
 * about the question. With nothing selected it falls back to state and degree, exactly what every
 * row showed before, so nobody who never clicks a facet sees a regression.
 */
export function rowFacts(idea: Idea, terms: readonly string[], model: KnowledgeModel): RowFact[] {
    const source = terms.length === 0 ? DEFAULT_FACTS : terms;
    const facts: RowFact[] = [];
    const seen = new Set<string>();
    for (const term of source) {
        if (facts.length >= ROW_FACT_LIMIT) break;
        const fact = factFor(term, idea, model);
        if (!fact) continue;
        const identity = `${fact.key}:${fact.arg ?? ""}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        facts.push(fact);
    }
    return facts;
}
