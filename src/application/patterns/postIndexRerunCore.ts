import type { Literal } from "architecture/plugin";

/**
 * Pure orchestration core for the post-index re-run (#200) — no live vault, no Obsidian event
 * wiring. Kept separate from `PostIndexRerun` (the arming/one-shot/timeout singleton) so the
 * value-producing logic is unit-testable in jest (FR-8). See docs/development/knowledge-patterns.md.
 */

/**
 * Fold a computed action delta over the note's existing frontmatter. The delta wins on collisions;
 * every other key survives untouched (FR-4, AC-4). Pure: neither input is mutated.
 */
export function mergeFrontmatterDelta(
    existing: Record<string, Literal>,
    delta: Record<string, Literal>
): Record<string, Literal> {
    return { ...existing, ...delta };
}
