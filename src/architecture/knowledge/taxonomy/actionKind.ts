import type { KnowledgeContext } from "architecture/knowledge/context/KnowledgeContext";

/**
 * The **Command / Query** classification of an action (#265, epic #262 Phase 3) — the primary axis of
 * the action taxonomy, over the #264 {@link KnowledgeContext} seam. A **Command** mutates knowledge
 * (a new note, relation, source, property, id, task or backlink); a **Query** observes the model and
 * writes only through the context sink, deriving state without other mutation.
 *
 * §XI: this lives in the Knowledge layer and is pure/offline — it imports `KnowledgeContext` by deep
 * path (never the `architecture/knowledge` barrel) and no platform API. `category` (#152) remains a
 * validated facet alongside `kind`; the two are single-sourced, not parallel taxonomies.
 */

export const ACTION_KINDS = ["command", "query"] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

/** Runtime guard mirroring `isActionCategory` — true for a valid {@link ActionKind} token. */
export function isActionKind(value: unknown): value is ActionKind {
    return typeof value === "string" && (ACTION_KINDS as readonly string[]).includes(value);
}

/** A knowledge **Query**: observes the model, returns a derived value, mutates nothing but its sink. */
export interface KnowledgeQuery<T = void> {
    readonly kind: "query";
    run(context: KnowledgeContext): T | Promise<T>;
}

/** A knowledge **Command**: performs a mutation of knowledge over the context. */
export interface KnowledgeCommand {
    readonly kind: "command";
    run(context: KnowledgeContext): void | Promise<void>;
}
