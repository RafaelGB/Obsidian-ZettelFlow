import type { Idea } from "../model/Idea";
import type { KnowledgeModel } from "../model/KnowledgeModel";

/**
 * **Ask your graph** (#318 S3) — a composable, *deterministic* query over the semantic graph and the
 * lifecycle, not natural-language/AI. The manifesto names this explicitly (*"show me every idea that
 * contradicts this"*): unlike Dataview, which queries frontmatter/tags, this queries **meaning and
 * structure** — typed relations, connectivity, sources, orphanhood, age, lifecycle state.
 *
 * A query is a small text expression of predicate **terms** combined with `AND` / `OR` (AND binds
 * tighter, i.e. disjunctive normal form: `a AND b OR c` = `(a AND b) OR c`). A term may be negated with
 * a leading `!`. Pure and Obsidian-free (reads only the {@link KnowledgeModel}); a malformed query
 * returns a clear `error` instead of throwing.
 */

const DAY_MS = 86_400_000;

/** A single predicate over one idea (with the model + a `now` clock for age predicates). */
type Predicate = (idea: Idea, model: KnowledgeModel, now: number) => boolean;

export interface GraphQueryResult {
    /** Ideas matching the query, most-connected first then by path. Empty on no match or on error. */
    matches: Idea[];
    /** Present only when the query could not be parsed: a short, human reason. */
    error?: string;
}

/** A ready-to-run example, for an "insert an example" affordance on the surface. */
export interface GraphQueryExample {
    label: string;
    query: string;
}

export const GRAPH_QUERY_EXAMPLES: readonly GraphQueryExample[] = [
    { label: "Permanent notes with no sources", query: "state:permanent AND unsourced" },
    { label: "Orphaned permanents older than 30 days", query: "state:permanent AND orphan AND older-than:30" },
    { label: "Hubs that contradict something", query: "hub AND relation:contradicts" },
    { label: "Ideas that support one note but contradict another", query: "relation:supports AND relation:contradicts" },
    { label: "Fleeting or still-unsourced ideas", query: "state:fleeting OR unsourced" },
];

/** A predicate token and what it selects — the referenceable vocabulary for the builder + the docs. */
export interface GraphQueryPredicate {
    token: string;
    note: string;
}

export const GRAPH_QUERY_PREDICATES: readonly GraphQueryPredicate[] = [
    { token: "state:<value>", note: "notes in a lifecycle state, e.g. state:permanent" },
    { token: "relation:<type>[:<target>]", note: "notes with an outgoing typed edge, e.g. relation:supports or relation:contradicts:ideaA" },
    { token: "degree>=<n>", note: "connectivity — also <=, >, <, = (e.g. degree>=5)" },
    { token: "hub", note: "a well-connected note (degree ≥ 5)" },
    { token: "orphan", note: "nothing links to it (no incoming edges)" },
    { token: "leaf", note: "it links to nothing (no outgoing edges)" },
    { token: "unsourced", note: "it makes a claim but cites no source" },
    { token: "older-than:<days>", note: "created more than N days ago" },
    { token: "newer-than:<days>", note: "created within the last N days" },
    { token: "about:<term>", note: "its title or path contains the term" },
    { token: "!<term>", note: "negate any term, e.g. !orphan" },
];

function basename(path: string): string {
    return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

function compareNum(value: number, op: string, n: number): boolean {
    switch (op) {
        case ">=": return value >= n;
        case "<=": return value <= n;
        case ">": return value > n;
        case "<": return value < n;
        default: return value === n;
    }
}

function negate(negated: boolean, predicate: Predicate): { predicate: Predicate } {
    return { predicate: negated ? (i, m, n) => !predicate(i, m, n) : predicate };
}

/** Parse one term into a predicate, or an `error`. */
function parseTerm(raw: string): { predicate?: Predicate; error?: string } {
    let text = raw.trim();
    if (text === "") return { error: "empty term" };

    let negated = false;
    if (text.startsWith("!")) {
        negated = true;
        text = text.slice(1).trim();
    }

    const degreeMatch = text.match(/^degree\s*(>=|<=|>|<|=)\s*(\d+)$/i);
    if (degreeMatch) {
        const op = degreeMatch[1];
        const n = Number(degreeMatch[2]);
        return negate(negated, (idea) => compareNum(idea.maturitySignals.degree, op, n));
    }

    const colon = text.indexOf(":");
    const key = (colon === -1 ? text : text.slice(0, colon)).toLowerCase();
    const arg = colon === -1 ? "" : text.slice(colon + 1).trim();

    switch (key) {
        case "state":
            if (!arg) return { error: "state: needs a value" };
            return negate(negated, (idea) => idea.state.toLowerCase() === arg.toLowerCase());
        case "relation": {
            if (!arg) return { error: "relation: needs a type" };
            const sep = arg.indexOf(":");
            const type = (sep === -1 ? arg : arg.slice(0, sep)).toLowerCase();
            const target = (sep === -1 ? "" : arg.slice(sep + 1).trim()).toLowerCase();
            return negate(negated, (idea) =>
                idea.relations.some(
                    (r) =>
                        r.type.toLowerCase() === type &&
                        (target === "" || basename(r.to).toLowerCase().includes(target) || r.to.toLowerCase().includes(target))
                )
            );
        }
        case "about":
            if (!arg) return { error: "about: needs a term" };
            return negate(negated, (idea) =>
                idea.title.toLowerCase().includes(arg.toLowerCase()) || idea.path.toLowerCase().includes(arg.toLowerCase())
            );
        case "older-than": {
            const n = Number(arg);
            if (!Number.isFinite(n)) return { error: "older-than: needs a number of days" };
            return negate(negated, (idea, _m, now) => idea.created > 0 && now - idea.created >= n * DAY_MS);
        }
        case "newer-than": {
            const n = Number(arg);
            if (!Number.isFinite(n)) return { error: "newer-than: needs a number of days" };
            return negate(negated, (idea, _m, now) => idea.created > 0 && now - idea.created <= n * DAY_MS);
        }
        case "unsourced":
            return negate(negated, (idea) => idea.claims.length > 0 && !idea.maturitySignals.hasSources);
        case "orphan":
            return negate(negated, (idea, model) => model.inNeighbors(idea.path).length === 0);
        case "leaf":
            return negate(negated, (idea, model) => model.outNeighbors(idea.path).length === 0);
        case "hub":
            return negate(negated, (idea) => idea.maturitySignals.degree >= 5);
        default:
            return { error: `unknown predicate "${key}"` };
    }
}

/** Split on a top-level keyword (`AND`/`OR`) as a whole, whitespace-delimited token. */
function splitOn(text: string, keyword: "AND" | "OR"): string[] {
    return text
        .split(new RegExp(`\\s+${keyword}\\s+`, "i"))
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
}

/**
 * Run a query against the model. A blank query matches nothing (not everything — the surface asks for
 * intent). Deterministic: matches are sorted by connectivity (degree desc) then path. A parse error in
 * any term aborts with `{ matches: [], error }`.
 */
export function runGraphQuery(model: KnowledgeModel, source: string, now: number = Date.now()): GraphQueryResult {
    const trimmed = source.trim();
    if (trimmed === "") return { matches: [] };

    const groups: Predicate[][] = [];
    for (const group of splitOn(trimmed, "OR")) {
        const preds: Predicate[] = [];
        for (const term of splitOn(group, "AND")) {
            const parsed = parseTerm(term);
            if (parsed.error || !parsed.predicate) return { matches: [], error: parsed.error ?? "invalid term" };
            preds.push(parsed.predicate);
        }
        if (preds.length > 0) groups.push(preds);
    }
    if (groups.length === 0) return { matches: [] };

    const matches = model
        .all()
        .filter((idea) => groups.some((preds) => preds.every((p) => p(idea, model, now))))
        .sort((a, b) => b.maturitySignals.degree - a.maturitySignals.degree || a.path.localeCompare(b.path));
    return { matches };
}
