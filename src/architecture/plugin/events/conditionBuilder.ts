/**
 * The **guided condition composer** (#235, epic #318 S5). Writing the `zf` expression for a workflow
 * trigger by hand is the sharpest authoring-friction point for a non-programmer. This pure,
 * Obsidian-free module turns a `{field, operator, value}` clause chosen from pickers into a valid
 * expression string — the exact shape the runtime evaluator ({@link evaluateBindingCondition}) runs and
 * that {@link sanityCheckCondition} accepts. It validates first, so an incomplete or nonsensical clause
 * is caught with a clear message instead of emitting broken JS. Deterministic; no dependencies.
 */

/** A comparison operator offered by the guided builder. */
export interface ConditionOperator {
    /** Stable id used by the picker and {@link buildConditionExpression}. */
    id: string;
    /** Whether the operator needs a value input (false for the emptiness checks). */
    takesValue: boolean;
    /** Whether the value must be a finite number (the ordering operators). */
    numeric?: boolean;
}

/** The operator vocabulary, in menu order. Labels live in the i18n layer (`condition_op_<id>`). */
export const CONDITION_OPERATORS: readonly ConditionOperator[] = [
    { id: "equals", takesValue: true },
    { id: "not-equals", takesValue: true },
    { id: "contains", takesValue: true },
    { id: "starts-with", takesValue: true },
    { id: "ends-with", takesValue: true },
    { id: "greater-than", takesValue: true, numeric: true },
    { id: "less-than", takesValue: true, numeric: true },
    { id: "is-empty", takesValue: false },
    { id: "is-not-empty", takesValue: false },
];

/** One composed clause: which field, which operator, and (when needed) the value the user typed. */
export interface ConditionClause {
    /** The dotted accessor, e.g. `event.newValue` (see `CONDITION_FIELDS`). */
    field: string;
    /** An id from {@link CONDITION_OPERATORS}. */
    operator: string;
    /** The raw value the user typed; ignored for value-less operators. */
    value?: string;
}

/** The result of building a clause: either a valid `expression`, or an `error` to show the user. */
export interface BuiltCondition {
    ok: boolean;
    expression?: string;
    error?: string;
}

const operatorById = (id: string): ConditionOperator | undefined =>
    CONDITION_OPERATORS.find((op) => op.id === id);

/**
 * Compose a single clause into a `zf` expression. Validates the field, operator and value up front
 * (returning `{ ok:false, error }` on any gap) so the emitted string is always valid JS that both the
 * runtime evaluator and {@link sanityCheckCondition} accept. String values are safely quoted; numeric
 * operators emit the parsed number.
 */
export function buildConditionExpression(clause: ConditionClause): BuiltCondition {
    const field = clause.field.trim();
    if (field === "") return { ok: false, error: "pick a field" };

    const op = operatorById(clause.operator);
    if (!op) return { ok: false, error: "pick an operator" };

    const raw = clause.value ?? "";
    if (op.takesValue && raw.trim() === "") return { ok: false, error: "a value is required" };

    if (op.numeric) {
        const num = Number(raw);
        if (!Number.isFinite(num)) return { ok: false, error: "the value must be a number" };
        return { ok: true, expression: op.id === "greater-than" ? `Number(${field}) > ${num}` : `Number(${field}) < ${num}` };
    }

    const literal = JSON.stringify(raw);
    switch (op.id) {
        case "equals":
            return { ok: true, expression: `${field} === ${literal}` };
        case "not-equals":
            return { ok: true, expression: `${field} !== ${literal}` };
        case "contains":
            return { ok: true, expression: `String(${field}).includes(${literal})` };
        case "starts-with":
            return { ok: true, expression: `String(${field}).startsWith(${literal})` };
        case "ends-with":
            return { ok: true, expression: `String(${field}).endsWith(${literal})` };
        case "is-empty":
            return { ok: true, expression: `!${field}` };
        case "is-not-empty":
            return { ok: true, expression: `!!${field}` };
        default:
            return { ok: false, error: "pick an operator" };
    }
}
