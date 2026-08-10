import type { Claim, IdeaState, InlineField, Relation, RelationType } from "./Idea";

/**
 * Extension points that let sibling issues plug concrete vocabularies into the model WITHOUT
 * changing the {@link Idea} shape or the query signatures (FR-6 / AC-5):
 * - #146 provides a {@link StateSchema} (lifecycle states).
 * - #147 provides a {@link RelationSchema} (semantic relation types).
 * - #148 provides a {@link ClaimSchema} (claims & sources).
 *
 * When no schema is registered, `deriveIdea` falls back to the documented defaults
 * (`DEFAULT_STATE`, plain `DEFAULT_RELATION_TYPE` links, no claims).
 */

export interface RelationParseInput {
    path: string;
    frontmatter: Record<string, unknown>;
    inlineFields: InlineField[];
    outgoingLinks: string[];
    /**
     * Optional map of wikilink name → resolved vault path, filled by the Obsidian-facing layer
     * (#147) so the pure schema can emit edges to real paths without resolving links itself.
     * Additive: absent for schemas that don't need it.
     */
    resolvedTargets?: Record<string, string>;
}

export interface ClaimParseInput {
    path: string;
    frontmatter: Record<string, unknown>;
    inlineFields: InlineField[];
}

export interface StateSchema {
    /** Frontmatter property the state is read from (e.g. "state"). */
    readonly property: string;
    /** The full, ordered set of states this schema recognises. */
    readonly all: readonly IdeaState[];
    parse(frontmatter: Record<string, unknown>): IdeaState;
}

export interface RelationSchema {
    readonly types: readonly RelationType[];
    parse(input: RelationParseInput): Relation[];
}

export interface ClaimSchema {
    parse(input: ClaimParseInput): Claim[];
}

export interface KnowledgeSchemas {
    state?: StateSchema;
    relations?: RelationSchema;
    claims?: ClaimSchema;
}
