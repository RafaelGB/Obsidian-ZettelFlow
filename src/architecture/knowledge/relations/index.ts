// DEFAULT_RELATION_TYPE is intentionally not re-exported here — it already comes from the model
// barrel (model/Idea), and a second star re-export would collide in knowledge/index.ts.
export {
    SEMANTIC_RELATION_TYPES,
    ALL_RELATION_TYPES,
    isRelationType,
    isSemanticRelationType,
} from "./vocabulary";
export type { SemanticRelationType } from "./vocabulary";
export { stripWikilink, extractWikilinks } from "./wikilink";
export { SemanticRelationSchema } from "./RelationSchema";
