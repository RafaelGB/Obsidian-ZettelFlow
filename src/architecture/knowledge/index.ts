// Public surface of the Knowledge Model (#145) — the foundation of epic #144.
export * from "./model/Idea";
export * from "./model/schema";
export { KnowledgeModel } from "./model/KnowledgeModel";
export { extractEdges } from "./derive/edges";
export { parseInlineFields } from "./parse/inlineFields";
export * from "./lifecycle";
export * from "./relations";
export * as knowledgeQueries from "./query/queries";
export { KnowledgeIndex } from "./KnowledgeIndex";
export type { KnowledgeIndexStatus } from "./KnowledgeIndex";
