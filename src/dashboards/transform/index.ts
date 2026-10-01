/** Base Dashboards — the transform pipeline barrel (epic #622, S5 #627). */
export * from "./types";
export { applyTransforms, effectiveFields } from "./apply";
export { toPlainRows, fromPlainRows, runComputed } from "./script";
export type { PlainRow, ScriptRun, ComputedResult } from "./script";
