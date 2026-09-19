import type { Idea } from "../model/Idea";
import type { KnowledgeModel } from "../model/KnowledgeModel";
import { byConnectivity, runGraphQuery } from "./graphQuery";

/**
 * **A selection, as a value** (#483, epic #481).
 *
 * The surface used to treat the *query text* as the thing it held, and everything else — the
 * results, the saved entry, the builder's output — as text manipulation around it. That is why
 * composing a query felt like writing code: it was.
 *
 * Here the thing held is an ordered list of **terms**. The chips are the terms. The query text is
 * {@link toQuery}. The results are {@link matchesFor}. The text is the *projection*, which is what
 * [§XIII](../../../../docs/development/constitution.md) asks for — syntax as an export format and
 * an escape hatch, never the front door.
 *
 * Two deliberate refusals:
 *
 * - **No second parser.** `graphQuery.ts` already parses; splitting on a top-level `AND` is all
 *   this module does, and anything it cannot split it hands back as `null` rather than guessing.
 * - **No change to the engine's contract.** `runGraphQuery("")` still matches nothing. *No filters
 *   means your whole vault* is a decision the **surface** takes, so every saved query keeps
 *   returning exactly what it returned before.
 */

const AND = /\s+and\s+/i;
const OR = /(^|\s)or(\s|$)/i;

/** The terms, joined the way the parser reads them. An empty selection is an empty string. */
export function toQuery(terms: readonly string[]): string {
    return terms.map((term) => term.trim()).filter((term) => term !== "").join(" AND ");
}

/**
 * Read a query back as the terms that would compose it, or `null` when it cannot be shown as
 * chips. A disjunction is not a list of narrowing clicks, and flattening one would silently
 * change what the query means the next time it is saved.
 */
export function asSelection(query: string): string[] | null {
    const trimmed = query.trim();
    if (trimmed === "") return [];
    if (OR.test(trimmed)) return null;
    return trimmed.split(AND).map((term) => term.trim()).filter((term) => term !== "");
}

/** The term without its negation, so `orphan` and `!orphan` count as the same choice. */
function bare(term: string): string {
    const trimmed = term.trim();
    return trimmed.startsWith("!") ? trimmed.slice(1).trim() : trimmed;
}

/**
 * Add a term, or take it back out. Clicking the facet value you already negated clears it rather
 * than adding a second copy of the same choice — negation is a state of a chip, not a new one.
 */
export function toggleTerm(terms: readonly string[], term: string): string[] {
    const target = bare(term);
    const without = terms.filter((existing) => bare(existing) !== target);
    return without.length === terms.length ? [...terms, term.trim()] : without;
}

/** Flip a term's negation. This is how negation stays reachable without typing anything. */
export function invertTerm(term: string): string {
    const trimmed = term.trim();
    return trimmed.startsWith("!") ? trimmed.slice(1).trim() : `!${trimmed}`;
}

/**
 * What the selection matches. **No terms means every note** — the surface shows you something the
 * moment it opens, and it costs zero typing to get there. Ordering is the engine's own, so
 * narrowing from everything to twelve never reshuffles what was already on screen.
 */
export function matchesFor(model: KnowledgeModel, terms: readonly string[], now?: number): Idea[] {
    const source = toQuery(terms);
    if (source === "") return model.all().sort(byConnectivity);
    return runGraphQuery(model, source, now).matches;
}
