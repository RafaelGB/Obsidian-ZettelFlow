import type { Literal } from "architecture/plugin";
import type { Action } from "architecture/api";
import type { NoteDTO } from "application/notes/model/NoteDTO";
import { ContentDTO } from "application/notes/model/ContentDTO";
import { runOnCreationActions, ActionLookup } from "application/patterns/runOnCreationActions";

/**
 * Pure orchestration core for the post-index re-run (#200) — no live vault, no Obsidian event
 * wiring. Kept separate from `PostIndexRerun` (the arming/one-shot/timeout singleton) so the
 * value-producing logic is unit-testable in jest (FR-8). See docs/development/knowledge-patterns.md.
 */

/**
 * Re-run a note's on-creation actions against the (now indexed) vault and return ONLY the
 * frontmatter delta they produced — the declared frontmatter-zone key of each action (FR-1, AC-1).
 *
 * The content is seeded from the note's current frontmatter so actions that read existing keys still
 * see them, but the returned delta carries only the actions' own declared keys (never a seed key),
 * so folding it back cannot clobber unrelated user frontmatter (FR-4, AC-4). Best-effort per action
 * via {@link runOnCreationActions}: a throwing action is logged and skipped, its key simply absent
 * from the delta (AC-6). Context-zone results are not frontmatter and are excluded.
 */
export async function computeOnCreationDelta(
    currentFrontmatter: Record<string, Literal>,
    actions: Action[],
    getAction: ActionLookup,
    notePath: string
): Promise<Record<string, Literal>> {
    const content = new ContentDTO();
    content.addFrontMatter({ ...currentFrontmatter });
    const context: Record<string, Literal> = {};
    // The on-creation (knowledge) actions read only `note.getFinalPath()` to rank the note against
    // the graph (see resolveTargetPath). A minimal stand-in keeps the core pure and byte-correct for
    // any vault path, without reconstructing a NoteDTO from folder + title.
    const note = { getFinalPath: () => notePath } as unknown as NoteDTO;

    await runOnCreationActions(actions, { content, note, context }, getAction);

    const produced = content.getFrontmatter();
    const delta: Record<string, Literal> = {};
    for (const action of actions) {
        const key = typeof action.key === "string" ? action.key : undefined;
        if (!key) continue;
        if (action.zone === "context") continue;
        if (Object.prototype.hasOwnProperty.call(produced, key)) {
            delta[key] = produced[key];
        }
    }
    return delta;
}

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
