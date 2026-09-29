/**
 * Inline hashtags in a thought's body (#596) — tweet-style: you write `#idea`, it becomes a tag.
 *
 * Tags are **emergent, never imposed**: there is no field to fill and nothing is required. They are
 * parsed from the text you already wrote and stored nowhere else (no frontmatter, no schema), so the
 * Lab stays "before it has to be knowledge" — a retrieval aid, not a filing obligation (#469). The
 * Lab folder is scope-excluded, so these never enter the knowledge model or the vault's tag graph.
 *
 * Rules: a `#` counts only at a **boundary** (start of the text or after whitespace), so a URL
 * fragment (`…/p#section`) and a glued `word#x` are not tags; a `#` inside an inline-code span
 * (`` `#ffffff` ``) is not a tag; the tag runs until a punctuation/whitespace boundary; results keep
 * the order they appear and are de-duplicated case-insensitively (first casing wins).
 */
export function parseTags(body: string): string[] {
    // Blank out inline-code spans so a `#hash` inside code is never read as a tag.
    const scannable = body.replace(/`[^`]*`/g, " ");
    const re = /(^|\s)#([\p{L}\p{N}][\p{L}\p{N}_/-]*)/gu;
    const tags: string[] = [];
    const seen = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = re.exec(scannable)) !== null) {
        const tag = match[2];
        const key = tag.toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            tags.push(tag);
        }
    }
    return tags;
}
