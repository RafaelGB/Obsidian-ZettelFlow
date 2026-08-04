/**
 * Substitute representative token values in a step's body template for live preview.
 * Pure function — no Obsidian dependency; safe to test in Jest.
 */
export function substitutePreviewTokens(
    template: string,
    title: string,
    date: string
): string {
    return template
        .replace(/\{\{title\}\}/g, title || "My note")
        .replace(/\{\{frontmatter\.[^}]+\}\}/g, "")
        .replace(/\{\{date\}\}/g, date)
        .replace(/\{\{canvas\.name\}\}/g, "")
        .replace(/\{\{[^}]+\}\}/g, "");
}
