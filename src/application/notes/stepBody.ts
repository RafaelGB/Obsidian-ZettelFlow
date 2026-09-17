/**
 * Where a step's template body comes from (#426, epic #422) — pure.
 *
 * A step note keeps its template in its **file**; an inline box has no file, so until now it could
 * not carry a template at all — it could only contribute actions. That made the path #400 wants to
 * promote the poorest one, and the only way around it was to convert the node into a note.
 *
 * An inline box now stores its body in its own step settings, beside `actions` and `satellite`. This
 * decides, for a walked flow, **which** template each step contributes and in what order — so the
 * builder and the preview walk one list instead of each inventing a merge.
 */

export type TemplateSource =
    | { position: number; path: string }
    | { position: number; body: string };

/**
 * Every step's template, in step order. A file wins over an inline body at the same position (that
 * combination is a migration artefact, and the file is the one the author sees), and a blank inline
 * body contributes nothing rather than an empty block.
 */
export function orderedTemplateSources(
    paths: Map<number, string>,
    inlineBodies: Map<number, string>
): TemplateSource[] {
    const sources: TemplateSource[] = [];

    for (const [position, path] of paths) {
        if (path) sources.push({ position, path });
    }
    for (const [position, body] of inlineBodies) {
        if (paths.has(position)) continue;
        if (body.trim().length === 0) continue;
        sources.push({ position, body });
    }

    return sources.sort((a, b) => a.position - b.position);
}
