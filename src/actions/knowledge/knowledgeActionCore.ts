import { ExecuteInfo } from "architecture/api";
import { KnowledgeIndex } from "architecture/knowledge/KnowledgeIndex";
import type { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import type { KnowledgeActionElement } from "zettelkasten";

/**
 * The **execution core** of the #153/#154 knowledge & relation actions — the model guard, target
 * resolver and result writer — decoupled from the authoring UI (`knowledgeActionShared` re-exports
 * these). Keeping them here (no `navbarAction`/`Setting`/React import) lets the #264 KnowledgeContext
 * adapter and its unit tests load without dragging the whole settings/modal graph. Engine-side:
 * `readyModel` touches the platform-coupled `KnowledgeIndex`; the pure seam it feeds does not.
 */

/** The knowledge model when the index is ready, else `null` (the action then safely no-ops). */
export function readyModel(): KnowledgeModel | null {
    const index = KnowledgeIndex.getInstance();
    if (index.status !== "ready") return null;
    return index.getModel();
}

/** The note to analyze: the configured `target`, else the note being built (may not be indexed yet). */
export function resolveTargetPath(info: ExecuteInfo, el: KnowledgeActionElement): string | null {
    const configured = el.target?.trim();
    if (configured) return configured;
    const building = info.note.getFinalPath();
    return building && building.length > 0 ? building : null;
}

/** Write a knowledge action's result to the configured zone, and always expose it as `{{key}}`. */
export function writeKnowledgeResult(
    info: ExecuteInfo,
    el: KnowledgeActionElement,
    value: unknown
): void {
    const key = el.key;
    if (!key) return;
    if (el.zone !== "context") info.content.addFrontMatter({ [key]: value });
    info.context[key] = value;
}
