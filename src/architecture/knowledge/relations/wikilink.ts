/**
 * Pure wikilink helpers (Obsidian-free). Turn `[[Target|alias]]` / `[[Target#heading]]` /
 * `[[Target^block]]` and lists of them into bare target names, ready for path resolution by the
 * Obsidian-facing layer.
 */

const WIKILINK = /\[\[([^\]]+)\]\]/g;

/** Reduce a single link (with or without `[[ ]]`) to its bare target name (no alias/heading/block). */
export function stripWikilink(raw: string): string {
    let name = raw.trim();
    const wrapped = /^\[\[(.+?)\]\]$/.exec(name);
    if (wrapped) name = wrapped[1];
    const pipe = name.indexOf("|");
    if (pipe !== -1) name = name.slice(0, pipe);
    name = name.replace(/[#^].*$/, "");
    return name.trim();
}

/** Extract bare target names from a scalar or list frontmatter/inline value. Non-links → `[]`. */
export function extractWikilinks(value: unknown): string[] {
    const names: string[] = [];
    const scan = (v: unknown): void => {
        if (typeof v !== "string") return;
        const matches = v.match(WIKILINK);
        if (!matches) return;
        for (const match of matches) {
            const name = stripWikilink(match);
            if (name.length > 0) names.push(name);
        }
    };
    if (Array.isArray(value)) value.forEach(scan);
    else scan(value);
    return names;
}
