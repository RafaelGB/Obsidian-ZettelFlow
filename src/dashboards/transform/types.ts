/**
 * Per-panel transform pipeline (epic #622, S5 #627) — level 2 of the three transform levels
 * (1: Base formulas · 2: these visual transforms · 3: the script transformer, S6). Pure vocabulary.
 * Every field a transform produces is **virtual**: it lives on the derived table for the render and
 * is never written back to a note (§XII).
 */
import type { AggregateFn } from "dashboards/panels";

export type FilterOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains";
export type CalcOp = "add" | "sub" | "mul" | "div";

export type TransformType =
    | "filter"
    | "sort"
    | "groupBy"
    | "aggregate"
    | "bin"
    | "calculate"
    | "normalize"
    | "movingAverage"
    | "cumulative";

export interface TransformStep {
    id: string;
    type: TransformType;
    /** Primary field the step reads. */
    field?: string;
    /** Secondary field (groupBy value; calculate right operand). */
    field2?: string;
    /** Filter comparison or calculate operator. */
    op?: FilterOp | CalcOp;
    /** Literal operand: filter value, calculate constant, bin size, or window length. */
    value?: string;
    direction?: "asc" | "desc";
    aggregate?: AggregateFn;
    /** Output field name for calculate/bin/movingAverage/cumulative (defaults derived from `field`). */
    newField?: string;
}
