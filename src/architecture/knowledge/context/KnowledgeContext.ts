import type { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import type { Literal } from "architecture/plugin/model/FrontmatterModel";

/**
 * The **KnowledgeContext seam** (#264, epic #262 Phase 2) — the pure domain object a knowledge/relation
 * action operates on, instead of a wizard-shaped `Note`. It names the *only three* concerns those
 * actions touch today: the **identity** of the knowledge under operation, a read-only **model view**
 * (current frontmatter + the offline `KnowledgeModel`), and a **result sink**.
 *
 * §XI boundary: this module is pure and offline. It imports `KnowledgeModel` by **deep path** (never
 * the `architecture/knowledge` barrel, which re-exports the obsidian-importing `KnowledgeIndex`), no
 * `obsidian`, no `NoteDTO`/`ContentDTO`, no `KnowledgeIndex`. The model is **injected** by the
 * engine-side adapter (`actions/knowledge/knowledgeContextAdapter`), so the type never reaches for a
 * singleton — which is what keeps it testable with no live vault.
 */

/** Writes a result to the note: frontmatter zones reach frontmatter, all zones mirror to `{{key}}`. */
export type KnowledgeSink = (key: string, value: unknown, zone: string) => void;

export interface KnowledgeContext {
    /** The note/idea under operation — `el.target` or the built note's path, or `null` (no source). */
    readonly identity: string | null;
    /** The note's current frontmatter, read-only (all writes go through {@link write}). */
    readonly frontmatter: Readonly<Record<string, Literal>>;
    /** The offline knowledge model, or `null` when the index isn't ready. Injected by the adapter. */
    readonly model: KnowledgeModel | null;
    /** Write a result to the given zone (see {@link KnowledgeSink}). */
    write(key: string, value: unknown, zone: string): void;
}

const NO_OP_SINK: KnowledgeSink = () => undefined;

/**
 * Pure factory for a {@link KnowledgeContext}. Identity-only construction (no model, no frontmatter,
 * no sink) yields a valid context with `model = null`, `frontmatter = {}` and a no-op `write` (FR-7),
 * so a context is constructible from a bare path with no `NoteDTO`.
 */
export function createKnowledgeContext(parts: {
    identity?: string | null;
    frontmatter?: Record<string, Literal>;
    model?: KnowledgeModel | null;
    sink?: KnowledgeSink;
}): KnowledgeContext {
    const sink = parts.sink ?? NO_OP_SINK;
    return {
        identity: parts.identity ?? null,
        frontmatter: parts.frontmatter ?? {},
        model: parts.model ?? null,
        write: (key, value, zone) => sink(key, value, zone),
    };
}
