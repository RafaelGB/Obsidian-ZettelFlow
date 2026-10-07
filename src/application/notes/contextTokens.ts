import type { CrystallizeSeed } from "application/thinking/crystallize";

const FRONTMATTER_TOKEN = /\{\{frontmatter\.([^}]+)\}\}/g;
const CANVAS_NAME_TOKEN = /\{\{canvas\.name\}\}/g;
const CRYSTALLIZE_CONTENT = "{{crystallize.content}}";

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

/**
 * The crystallized note in a crystallize flow (#712) — one rule, read by the build and the preview
 * so they cannot drift.
 *
 * - `{{crystallize.content}}` becomes the content at its **first** occurrence (exactly once); with
 *   none, the content goes at the **top** of the body.
 * - `{{crystallize.title|quote|source}}` become the seed's values.
 * - With no seed (any other flow) all four become empty text, never a literal `{{…}}`.
 *
 * Run after the actions, so an action's `{{key}}` replacement never re-reads your words.
 */
export function resolveCrystallizeTokens(body: string, seed: CrystallizeSeed | undefined): string {
    const values = seed ? { title: seed.title, quote: seed.quote, source: seed.source } : { title: "", quote: "", source: "" };
    // Split rather than replace: a `$` in your words is text, not a replacement pattern.
    const placed = (text: string, token: string, value: string): string => text.split(token).join(value);
    let out = placed(body, "{{crystallize.title}}", values.title);
    out = placed(out, "{{crystallize.quote}}", values.quote);
    out = placed(out, "{{crystallize.source}}", values.source);

    const content = seed?.content ?? "";
    const at = out.indexOf(CRYSTALLIZE_CONTENT);
    if (at < 0) {
        if (!seed) return out;
        return out.length > 0 ? `${content}\n${out}` : content;
    }
    const before = out.slice(0, at);
    const after = placed(out.slice(at + CRYSTALLIZE_CONTENT.length), CRYSTALLIZE_CONTENT, "");
    return `${before}${content}${after}`;
}
