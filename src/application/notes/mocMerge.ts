/**
 * Pure merge core for the map-of-content (MOC) builder.
 *
 * Obsidian-free so it can be unit-tested. The MOC note is split into two territories:
 *  - a **machine-managed region** delimited by {@link MOC_REGION_START} / {@link MOC_REGION_END}
 *    that ZettelFlow owns and rewrites on every run, and
 *  - everything outside those markers, which belongs to the user and is preserved.
 */

/** Opening marker of the ZettelFlow-managed region. */
export const MOC_REGION_START = "<!-- zettelflow:moc:start -->";
/** Closing marker of the ZettelFlow-managed region. */
export const MOC_REGION_END = "<!-- zettelflow:moc:end -->";

/** A single link rendered inside the managed region. */
export type MocLink = { path: string; title: string };

/**
 * Renders the managed region body: a heading followed by one wikilink per link, in the
 * order given (the caller is responsible for sorting). Output always ends with a newline.
 *
 * Example: `## Notes in this map\n\n- [[a|A]]\n- [[b|B]]\n`.
 */
export function renderMocRegion(links: MocLink[], heading: string): string {
    const lines: string[] = [`## ${heading}`, ""];
    for (const link of links) {
        lines.push(`- [[${link.path}|${link.title}]]`);
    }
    return `${lines.join("\n")}\n`;
}

/**
 * Merges the managed link region into an existing MOC body.
 *
 *  - When the body already contains a START..END region, its whole block (markers included)
 *    is replaced with the freshly rendered region; everything before START and after END is
 *    preserved byte-for-byte.
 *  - When the body has no region, the region is appended after exactly one blank line and the
 *    result ends with a trailing newline; all existing prose is preserved.
 *  - An empty (or whitespace-only) body yields a clean region.
 *
 * Idempotent: `mergeMocRegion(mergeMocRegion(body, l, h), l, h) === mergeMocRegion(body, l, h)`.
 */
export function mergeMocRegion(body: string, links: MocLink[], heading: string): string {
    const block = `${MOC_REGION_START}\n${renderMocRegion(links, heading)}${MOC_REGION_END}`;

    const startIdx = body.indexOf(MOC_REGION_START);
    const endIdx = body.indexOf(MOC_REGION_END);

    if (startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx) {
        const before = body.slice(0, startIdx);
        const after = body.slice(endIdx + MOC_REGION_END.length);
        return `${before}${block}${after}`;
    }

    if (body.trim() === "") {
        return `${block}\n`;
    }

    const priorContent = body.replace(/\n+$/, "");
    return `${priorContent}\n\n${block}\n`;
}
