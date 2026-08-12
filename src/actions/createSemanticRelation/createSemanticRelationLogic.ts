import { isSemanticRelationType } from "architecture/knowledge/relations/vocabulary";

/** A typed relation as a frontmatter field: the relation type is the key, the target a `[[link]]`. */
export interface SemanticRelationField {
    key: string;
    value: string;
}

/**
 * Pure builder for a typed semantic relation (#154, FR-4/AC-2). Given a relation `type` from the
 * #147 semantic vocabulary and a target note name, returns the frontmatter field
 * `{ key: type, value: "[[target]]" }` that {@link SemanticRelationSchema} then indexes as a single
 * typed edge. Returns `null` (a safe no-op) for a type outside the vocabulary or an empty target.
 * Obsidian-free and deterministic.
 */
export function semanticRelationField(type: string, target: string): SemanticRelationField | null {
    if (!isSemanticRelationType(type)) return null;
    const name = (target ?? "").trim().replace(/\.md$/i, "");
    if (!name) return null;
    return { key: type, value: `[[${name}]]` };
}
