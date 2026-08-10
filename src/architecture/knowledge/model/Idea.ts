import { DEFAULT_RELATION_TYPE, extractEdges } from "../derive/edges";
import type { KnowledgeSchemas } from "./schema";

export type IdeaState = string;
export type RelationType = string;

/** State of a note that no {@link StateSchema} (#146) has classified yet. */
export const DEFAULT_STATE: IdeaState = "unknown";
export { DEFAULT_RELATION_TYPE };

export interface Source {
    ref: string;
}

export interface Claim {
    text: string;
    sources: Source[];
}

/** A directed, typed edge between two notes (identity = vault path). */
export interface Relation {
    type: RelationType;
    from: string;
    to: string;
}

/** Raw, graph-local signals — the maturity *score* itself is #158/#159, out of scope here. */
export interface MaturitySignals {
    inDegree: number;
    outDegree: number;
    degree: number;
    hasSources: boolean;
}

export interface InlineField {
    key: string;
    value: string;
}

/** A note modelled as an idea. Identity is the vault `path` (decision #3). */
export interface Idea {
    path: string;
    title: string;
    created: number;
    modified: number;
    state: IdeaState;
    maturitySignals: MaturitySignals;
    /** Outgoing typed edges. Vocabulary owned by #147; defaults to plain links. */
    relations: Relation[];
    /** Claims & sources. Owned by #148; defaults to `[]`. */
    claims: Claim[];
}

/** The pure, read-only input the Obsidian-facing layer hands to {@link deriveIdea}. */
export interface IdeaSnapshot {
    path: string;
    title: string;
    created: number;
    modified: number;
    frontmatter: Record<string, unknown>;
    tags: string[];
    outgoingLinks: string[];
    inlineFields: InlineField[];
    /** Optional wikilink name → resolved vault path map (filled by the Obsidian layer, #147). */
    resolvedTargets?: Record<string, string>;
}

function basename(path: string): string {
    const file = path.split("/").pop() ?? path;
    return file.replace(/\.md$/i, "");
}

function safe<T>(fn: () => T, fallback: T): T {
    try {
        return fn();
    } catch {
        return fallback;
    }
}

/**
 * Derive an {@link Idea} from a pure snapshot. Never throws and never touches Obsidian: a
 * cache-miss / empty-frontmatter snapshot yields documented safe defaults (FR-1, FR-9, AC-6).
 * Graph-global signals (`inDegree`, final `degree`) are filled in by {@link KnowledgeModel} once
 * the note is placed in the graph; here they start at the note-local values.
 */
export function deriveIdea(snapshot: IdeaSnapshot, schemas: KnowledgeSchemas = {}): Idea {
    const fm = snapshot.frontmatter ?? {};
    const inlineFields = snapshot.inlineFields ?? [];
    const outgoingLinks = snapshot.outgoingLinks ?? [];

    const state = schemas.state
        ? safe(() => schemas.state!.parse(fm), DEFAULT_STATE)
        : DEFAULT_STATE;

    const relations = schemas.relations
        ? safe(
            () =>
                schemas.relations!.parse({
                    path: snapshot.path,
                    frontmatter: fm,
                    inlineFields,
                    outgoingLinks,
                    resolvedTargets: snapshot.resolvedTargets ?? {},
                }),
            []
        )
        : extractEdges(snapshot.path, outgoingLinks);

    const claims = schemas.claims
        ? safe(() => schemas.claims!.parse({ path: snapshot.path, frontmatter: fm, inlineFields }), [])
        : [];

    const outDegree = relations.length;
    const hasSources = claims.some((claim) => claim.sources.length > 0);

    return {
        path: snapshot.path,
        title: snapshot.title || basename(snapshot.path),
        created: snapshot.created ?? 0,
        modified: snapshot.modified ?? 0,
        state,
        relations,
        claims,
        maturitySignals: { inDegree: 0, outDegree, degree: outDegree, hasSources },
    };
}
