import { DEFAULT_RELATION_TYPE } from "../derive/edges";
import type { RelationType } from "../model/Idea";

export { DEFAULT_RELATION_TYPE };

/**
 * The default semantic relation vocabulary (#147). Directed edges whose meaning goes beyond a
 * plain `[[link]]`. Fixed here (extensible in code); a user-facing vocabulary editor is deferred.
 */
export const SEMANTIC_RELATION_TYPES = [
    "supports",
    "contradicts",
    "expands",
    "inspired-by",
    "question",
    "example",
    "implements",
] as const;

export type SemanticRelationType = (typeof SEMANTIC_RELATION_TYPES)[number];

/** Every recognised relation type: the semantic set plus the plain-link fallback. */
export const ALL_RELATION_TYPES: readonly RelationType[] = [
    ...SEMANTIC_RELATION_TYPES,
    DEFAULT_RELATION_TYPE,
];

const SEMANTIC_SET: ReadonlySet<string> = new Set(SEMANTIC_RELATION_TYPES);

/** True for a semantic relation key (used to pick relation-bearing frontmatter/inline fields). */
export function isSemanticRelationType(value: string): boolean {
    return SEMANTIC_SET.has(value);
}

/** True for any recognised relation type (the semantic set or the `link` fallback). */
export function isRelationType(value: string): boolean {
    return SEMANTIC_SET.has(value) || value === DEFAULT_RELATION_TYPE;
}
