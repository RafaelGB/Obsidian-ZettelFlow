import type { StaticTemplateOptions, SystemDifficulty } from "config";

/**
 * Fallback difficulty for the built-in systems, keyed by lowercased title (#285). Used when the backend
 * catalog entry carries no `difficulty` yet, so the gallery badge works without a backend re-deploy —
 * the `.zftemplate` sources also declare `difficulty`, which wins once the catalog serves it.
 */
export const SYSTEM_DIFFICULTY: Record<string, SystemDifficulty> = {
    "zettelflow tour": "easy",
    "concept note": "easy",
    "daily journal": "easy",
    "meeting notes": "easy",
    "inquiry": "easy",
    "reading": "medium",
    "gtd": "medium",
    "writing": "medium",
    "zettelkasten v2": "medium",
    "decision journal": "medium",
    "academic research": "hard",
    "para v2": "hard",
    "software architecture kb": "hard",
};

/** The difficulty to show for a system: its own field, else the built-in fallback, else none. Pure. */
export function resolveSystemDifficulty(
    template: Pick<StaticTemplateOptions, "template_type" | "title" | "difficulty">
): SystemDifficulty | undefined {
    if (template.template_type !== "system") return undefined;
    return template.difficulty ?? SYSTEM_DIFFICULTY[template.title.trim().toLowerCase()];
}
