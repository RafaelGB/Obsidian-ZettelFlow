/**
 * Replaces every {{key}} placeholder in a plain-text string with the matching frontmatter
 * value (inserted as text, never as HTML). Unknown keys are left untouched.
 *
 * Pure and dependency-free so it can be unit-tested in isolation and reused by the
 * markdown post-processor without pulling in Obsidian/CodeMirror.
 *
 * @param text The plain-text content of a single text node.
 * @param metadata The active file's frontmatter.
 */
export function substitutePlaceholders(
    text: string,
    metadata: Record<string, unknown>
): string {
    return text.replace(/{{(.*?)}}/g, (_match, key: string) => {
        const value = metadata[key.trim()];
        if (value == null) return `{{${key}}}`;
        if (typeof value === "string") return value;
        // Numbers, booleans, arrays and objects are serialized (avoids "[object Object]").
        return JSON.stringify(value);
    });
}
