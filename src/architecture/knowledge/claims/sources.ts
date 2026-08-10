import type { Source } from "../model/Idea";
import { extractWikilinks } from "../relations/wikilink";

/**
 * Classify a frontmatter/inline value into typed {@link Source}s (#148):
 * - a value containing `[[X]]` / `[[X|alias]]` / `[[X#heading]]` → `{ kind: "link", ref }` where
 *   `ref` is the resolved vault path (unresolved links are excluded);
 * - anything else (URL / DOI / citation / plain text) → `{ kind: "text", ref }` (trimmed).
 *
 * Pure and Obsidian-free: link resolution comes from the caller-supplied `resolvedTargets` map
 * (filled by the Obsidian-facing layer). Shares the wikilink normalizer with `relations/`.
 */
export function classifySources(
    value: unknown,
    resolvedTargets: Record<string, string> = {}
): Source[] {
    const sources: Source[] = [];
    const scan = (item: unknown): void => {
        if (typeof item !== "string") return;
        const trimmed = item.trim();
        if (trimmed.length === 0) return;
        const links = extractWikilinks(trimmed);
        if (links.length > 0) {
            for (const name of links) {
                const ref = resolvedTargets[name];
                if (ref) sources.push({ ref, kind: "link" });
            }
        } else {
            sources.push({ ref: trimmed, kind: "text" });
        }
    };
    if (Array.isArray(value)) value.forEach(scan);
    else scan(value);
    return sources;
}
