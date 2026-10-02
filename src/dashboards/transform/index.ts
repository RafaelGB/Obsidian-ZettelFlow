/** Base Dashboards — the transform pipeline barrel (epic #622, S5 #627). */
export * from "./types";
export { applyTransforms, effectiveFields } from "./apply";
export { toPlainRows, fromPlainRows, runComputed, rowKeys } from "./script";
export type { PlainRow, PlainValue, ScriptRun, ComputedResult, ComputedWarning, RowKey } from "./script";
