import { SEMANTIC_RELATION_TYPES } from "./vocabulary";
import { stripWikilink } from "./wikilink";

/**
 * Pure, Obsidian-free core of the `remove-relation` command (#181). A typed relation is a frontmatter
 * field whose key is a semantic relation type and whose value is a `[[wikilink]]` (or a list of them),
 * exactly as `create-semantic-relation` writes it. These helpers list the removable edges and strip a
 * single edge from a frontmatter object; the Obsidian shell does the picker / confirm / file write.
 */

/** A single typed relation edge: the relation `type` (frontmatter key) and its bare `target` name. */
export interface RelationEdge {
    relationType: string;
    target: string;
}

export interface RemoveRelationResult {
    frontmatter: Record<string, unknown>;
    changed: boolean;
}

/**
 * A relation edge is only a value in `[[wikilink]]` form (as `create-semantic-relation` writes it).
 * A plain string under a relation-type key — e.g. `question: "What is X?"`, since `question`/`example`
 * are both relation types AND ordinary words — is NOT an edge and must never be listed or removed (#181).
 */
function isWikilinkValue(entry: unknown): entry is string {
    return typeof entry === "string" && /\[\[.+?\]\]/.test(entry);
}

/** Every typed-relation edge present in a frontmatter object, in field-then-value order. */
export function listRelationEdges(frontmatter: Record<string, unknown> | undefined): RelationEdge[] {
    if (!frontmatter) return [];
    const edges: RelationEdge[] = [];
    for (const relationType of SEMANTIC_RELATION_TYPES) {
        const value = frontmatter[relationType];
        const values = Array.isArray(value) ? value : [value];
        for (const entry of values) {
            if (!isWikilinkValue(entry)) continue;
            const target = stripWikilink(entry);
            if (target) edges.push({ relationType, target });
        }
    }
    return edges;
}

/**
 * Remove the edge (`relationType` → `target`) from a frontmatter object. Matches wikilink-normalized
 * (alias/heading/bare name all resolve to the target name; case-sensitive, matching Obsidian note
 * names). Deletes the key when its last value is removed. A missing key/value or empty target is a
 * safe no-op (`changed:false`, the input returned untouched). Never mutates the input.
 */
export function removeRelationField(
    frontmatter: Record<string, unknown>,
    relationType: string,
    target: string
): RemoveRelationResult {
    const wanted = stripWikilink(target);
    if (!wanted || !(relationType in frontmatter)) return { frontmatter, changed: false };

    const value = frontmatter[relationType];
    const matches = (entry: unknown): boolean => isWikilinkValue(entry) && stripWikilink(entry) === wanted;

    if (Array.isArray(value)) {
        const kept = value.filter((entry) => !matches(entry));
        if (kept.length === value.length) return { frontmatter, changed: false };
        const clone = { ...frontmatter };
        if (kept.length === 0) delete clone[relationType];
        else clone[relationType] = kept;
        return { frontmatter: clone, changed: true };
    }

    if (matches(value)) {
        const clone = { ...frontmatter };
        delete clone[relationType];
        return { frontmatter: clone, changed: true };
    }

    return { frontmatter, changed: false };
}
