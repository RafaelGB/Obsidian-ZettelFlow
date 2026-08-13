const FRONTMATTER_TOKEN = /\{\{frontmatter\.([^}]+)\}\}/g;
const CANVAS_NAME_TOKEN = /\{\{canvas\.name\}\}/g;

/**
 * Replaces {{frontmatter.KEY}} and {{canvas.name}} tokens in a template string.
 * Called by NoteBuilder after loading template content, before running user actions.
 *
 * - Missing frontmatter keys resolve to "".
 * - Unrecognised tokens (e.g. {{title}}) are left unchanged for action handlers.
 */
export function substituteContextTokens(
    content: string,
    frontmatter: Record<string, unknown>,
    canvasName: string
): string {
    return content
        .replace(FRONTMATTER_TOKEN, (_, key: string) => {
            const value = frontmatter[key];
            if (value === undefined || value === null) return "";
            if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
                return String(value);
            }
            if (Array.isArray(value)) return value.join(", ");
            return "";
        })
        .replace(CANVAS_NAME_TOKEN, canvasName);
}
