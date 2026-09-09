/**
 * The **guided term builder** for *Ask your graph* (#323 G5), mirroring the #235 condition builder.
 * Composing a query by hand is the sharpest authoring-friction point for a non-writer. This pure,
 * Obsidian-free module turns a `{field, comparison?, value?, negate?}` selection chosen from pickers
 * into a valid query **term** — the exact shape `runGraphQuery` parses (see `graphQuery.ts`). It
 * validates first, so an incomplete or query-breaking selection is caught with a clear message
 * instead of emitting a term the parser rejects. Deterministic; no dependencies.
 */

/** How a field takes its value: none (bare token), free text, or a whole number. */
export type GraphTermValueKind = "none" | "text" | "number";

/** A field offered by the builder — one per query predicate. Labels live in `ask_graph_field_<id>`. */
export interface GraphTermField {
    /** Stable id; also the predicate keyword (`state`, `degree`, `hub`, …). */
    id: string;
    value: GraphTermValueKind;
    /** `degree` needs a numeric comparison operator; the other numeric fields don't. */
    comparison?: boolean;
}

/** The field vocabulary, in menu order — the predicate set of {@link runGraphQuery}. */
export const GRAPH_TERM_FIELDS: readonly GraphTermField[] = [
    { id: "state", value: "text" },
    { id: "relation", value: "text" },
    { id: "incoming", value: "text" },
    { id: "folder", value: "text" },
    { id: "about", value: "text" },
    { id: "older-than", value: "number" },
    { id: "newer-than", value: "number" },
    { id: "degree", value: "number", comparison: true },
    { id: "hub", value: "none" },
    { id: "orphan", value: "none" },
    { id: "leaf", value: "none" },
    { id: "unsourced", value: "none" },
];

/** The numeric comparisons `degree` accepts, in menu order (matches the `graphQuery.ts` parser). */
export const GRAPH_TERM_COMPARISONS = [">=", "<=", ">", "<", "="] as const;

/** One composed selection: which field, an optional comparison (degree) and value, and negation. */
export interface GraphTermSelection {
    field: string;
    /** One of {@link GRAPH_TERM_COMPARISONS}; only read for `degree`. */
    comparison?: string;
    /** The raw value the user typed; ignored for value-less fields. */
    value?: string;
    /** Prepend `!` to negate the term. */
    negate?: boolean;
}

/** The result of building a term: either a valid `term`, or an `error` to show the user. */
export interface BuiltGraphTerm {
    ok: boolean;
    term?: string;
    error?: string;
}

/** A whitespace-delimited AND/OR would corrupt the query's disjunctive-normal-form tokenizer. */
const BOOLEAN_KEYWORD = /(^|\s)(and|or)(\s|$)/i;

/**
 * Compose a single selection into a query term. Validates the field, comparison and value up front
 * (returning `{ ok:false, error }` on any gap) so the emitted string always round-trips through
 * `parseTerm`. Text values are trimmed and rejected if they embed a boolean keyword; numeric values
 * must be non-negative whole numbers; `degree` additionally requires one of the five comparisons.
 */
export function buildGraphTerm(selection: GraphTermSelection): BuiltGraphTerm {
    const field = GRAPH_TERM_FIELDS.find((candidate) => candidate.id === selection.field);
    if (!field) return { ok: false, error: "pick a field" };

    const prefix = selection.negate ? "!" : "";

    if (field.value === "none") {
        return { ok: true, term: `${prefix}${field.id}` };
    }

    const raw = (selection.value ?? "").trim();
    if (raw === "") return { ok: false, error: "a value is required" };

    if (field.value === "number") {
        const num = Number(raw);
        if (!Number.isInteger(num) || num < 0) return { ok: false, error: "the value must be a whole number" };
        if (field.comparison) {
            const cmp = selection.comparison ?? "";
            if (!GRAPH_TERM_COMPARISONS.includes(cmp as (typeof GRAPH_TERM_COMPARISONS)[number])) {
                return { ok: false, error: "pick a comparison" };
            }
            return { ok: true, term: `${prefix}${field.id}${cmp}${num}` };
        }
        return { ok: true, term: `${prefix}${field.id}:${num}` };
    }

    // text
    if (BOOLEAN_KEYWORD.test(raw)) return { ok: false, error: "remove AND / OR from the value" };
    return { ok: true, term: `${prefix}${field.id}:${raw}` };
}
