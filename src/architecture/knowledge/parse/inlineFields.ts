import type { InlineField } from "../model/Idea";

/**
 * Standalone parser for Dataview-style inline `key:: value` fields (decision #2 — no Dataview
 * dependency). Pure and Obsidian-free. Recognises:
 * - full-line fields: `key:: value` (optionally under a list marker `- `),
 * - bracketed inline fields: `[key:: value]` or `(key:: value)`, possibly several per line.
 *
 * Ignores fenced code blocks and never mistakes a single-colon URL (`http://…`) for a field
 * (a field requires the double colon `::`).
 */
const FENCE = /^\s*(```|~~~)/;
const BRACKETED = /[[(]\s*([A-Za-z][\w-]*)\s*::\s*([^\])]+?)\s*[\])]/g;
const FULL_LINE = /^\s*(?:[-*+]\s+)?([A-Za-z][\w-]*)\s*::\s*(.+?)\s*$/;

export function parseInlineFields(body: string): InlineField[] {
    const fields: InlineField[] = [];
    if (!body) return fields;

    let inFence = false;
    for (const line of body.split(/\r?\n/)) {
        if (FENCE.test(line)) {
            inFence = !inFence;
            continue;
        }
        if (inFence) continue;

        let matchedBracket = false;
        BRACKETED.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = BRACKETED.exec(line)) !== null) {
            fields.push({ key: m[1], value: m[2].trim() });
            matchedBracket = true;
        }
        if (matchedBracket) continue;

        const full = FULL_LINE.exec(line);
        if (full) fields.push({ key: full[1], value: full[2].trim() });
    }
    return fields;
}
