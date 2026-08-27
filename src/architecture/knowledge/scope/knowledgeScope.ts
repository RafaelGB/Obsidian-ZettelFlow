/**
 * Knowledge **scope** (#311): the single predicate that decides whether a note is part of the
 * thinking system. Notes under a configured excluded path (config, templates, other vault tooling)
 * are kept out of the index, so they disappear from *every* mechanism at once — graph, health,
 * discovery, cultivate, home — because they never become an idea. One filter, by subtraction. Pure.
 */

/** Normalise raw prefixes: unify slashes, trim, strip leading/trailing `/`, drop empties, dedupe. */
export function normalizeExcludedPaths(raw: readonly string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const entry of raw) {
        const p = entry.replace(/\\/g, "/").trim().replace(/^\/+/, "").replace(/\/+$/, "");
        if (p.length === 0 || seen.has(p)) continue;
        seen.add(p);
        out.push(p);
    }
    return out;
}

/**
 * Whether `path` falls under any excluded prefix — folder-boundary aware, so `templates` excludes
 * `templates/x.md` and the note `templates.md`, but never `templates-other/…`. Prefixes are
 * normalised here, so callers can pass raw settings values.
 */
export function isPathExcluded(path: string, prefixes: readonly string[]): boolean {
    const normalizedPath = path.replace(/\\/g, "/").replace(/^\/+/, "");
    for (const prefix of normalizeExcludedPaths(prefixes)) {
        if (normalizedPath === prefix || normalizedPath === `${prefix}.md` || normalizedPath.startsWith(`${prefix}/`)) {
            return true;
        }
    }
    return false;
}

/** Split a textarea value (one prefix per line) into a normalised prefix list. */
export function parseExcludedPathsInput(text: string): string[] {
    return normalizeExcludedPaths(text.split(/\r?\n/));
}

/** Render a prefix list back to a textarea value (one per line). */
export function excludedPathsToText(prefixes: readonly string[]): string {
    return normalizeExcludedPaths(prefixes).join("\n");
}
