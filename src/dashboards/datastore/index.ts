/**
 * Base Dashboards — the pure DataStore barrel (the single door into the Obsidian-free core,
 * mirroring `architecture/knowledge/state`). Epic #622, S1 #623.
 */
export * from "./types";
export { inferSchema, inferFieldType } from "./schema";
export { normalize } from "./normalize";
export { reconcilePlan } from "./reconcile";
export type { ReconcilePlan } from "./reconcile";
