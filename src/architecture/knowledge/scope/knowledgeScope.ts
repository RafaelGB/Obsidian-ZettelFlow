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

/**
 * The scope-relevant slice of the plugin settings (kept minimal so this module stays config-free). The
 * folders here are ZettelFlow's own machinery — flow canvases and their step notes, hook flow scripts, the
 * JS library — never the user's own thinking, so they are excluded automatically.
 */
export interface ScopeSettings {
    excludedPaths?: readonly string[];
    /** Folder where folder-automation flow canvases (and their step notes) live. */
    foldersFlowsPath?: string;
    /** Folder holding the user's `zf` JS library. */
    jsLibraryFolderPath?: string;
    /** Folder for hook-triggered flow canvases. */
    hooks?: { folderFlowPath?: string };
}

/**
 * Every excluded prefix that defines the thinking system's scope (#311, extended): the user's own
 * excluded paths **plus** ZettelFlow's managed system folders, which are auto-excluded so system notes
 * are never indexed, cultivated, or counted anywhere. Deterministic and normalised.
 */
export function scopeExcludedPaths(settings: ScopeSettings): string[] {
    const system = [settings.foldersFlowsPath, settings.jsLibraryFolderPath, settings.hooks?.folderFlowPath];
    return normalizeExcludedPaths([
        ...(settings.excludedPaths ?? []),
        ...system.filter((p): p is string => typeof p === "string"),
    ]);
}

/** Split a textarea value (one prefix per line) into a normalised prefix list. */
export function parseExcludedPathsInput(text: string): string[] {
    return normalizeExcludedPaths(text.split(/\r?\n/));
}

/** Render a prefix list back to a textarea value (one per line). */
export function excludedPathsToText(prefixes: readonly string[]): string {
    return normalizeExcludedPaths(prefixes).join("\n");
}
