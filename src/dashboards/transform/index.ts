/** Base Dashboards — the transform pipeline barrel (epic #622, S5 #627). */
export * from "./types";
export { applyTransforms, effectiveFields } from "./apply";
export { toPlainRows, fromPlainRows, runScriptRows } from "./script";
export type { PlainRow, ScriptRun, ScriptResult } from "./script";
