/**
 * Knowledge **scope** (#311): the single predicate that decides whether a note is part of the
 * thinking system. Notes under a configured excluded path (config, templates, other vault tooling)
 * are kept out of the index, so they disappear from *every* mechanism at once — graph, health,
 * discovery, cultivate, home — because they never become an idea. One filter, by subtraction. Pure.
 */

/**
 * Normalise raw prefixes: unify slashes, trim, strip leading/trailing `/`, **Unicode-normalise to NFC**,
 * drop empties, dedupe. The NFC step (#374) is what makes an accented or emoji folder name match: a value
 * typed or pasted in one Unicode form (NFD) otherwise never equals the same-looking vault path in another.
 */
export function normalizeExcludedPaths(raw: readonly string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const entry of raw) {
        const p = entry.replace(/\\/g, "/").trim().replace(/^\/+/, "").replace(/\/+$/, "").normalize("NFC");
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
    return excludedPrefixOf(path, prefixes) !== null;
}

/**
 * The excluded prefix `path` falls under, or `null` when it is in scope (#688) — the same match as
 * {@link isPathExcluded}, which is built on it, so what a surface names as "the excluded folder" is
 * exactly what kept the note out of the index. The first matching prefix, in settings order.
 */
export function excludedPrefixOf(path: string, prefixes: readonly string[]): string | null {
    const normalizedPath = path.replace(/\\/g, "/").replace(/^\/+/, "").normalize("NFC");
    for (const prefix of normalizeExcludedPaths(prefixes)) {
        if (normalizedPath === prefix || normalizedPath === `${prefix}.md` || normalizedPath.startsWith(`${prefix}/`)) {
            return prefix;
        }
    }
    return null;
}

/**
 * The scope-relevant slice of the plugin settings (kept minimal so this module stays config-free). The
 * folders here are ZettelFlow's own machinery — flow canvases and their step notes, hook flow scripts, the
 * JS library — never the user's own thinking, so they are excluded automatically.
 */
export interface ScopeSettings {
    /**
     * The folders the previous version excluded. Since #713 a mirror of the folder rules, written
     * for one release so a downgrade keeps them; read only to migrate.
     */
    excludedPaths?: readonly string[];
    /** What is left out (#713): closed rules and the exceptions that keep a note in anyway. */
    knowledgeScope?: unknown;
    /** Folder where folder-automation flow canvases (and their step notes) live. */
    foldersFlowsPath?: string;
    /** Folder holding the user's `zf` JS library. */
    jsLibraryFolderPath?: string;
    /** Folder for hook-triggered flow canvases. */
    hooks?: { folderFlowPath?: string };
    /**
     * The Thought Lab (#466). Thinking that has not become knowledge yet, and must never be
     * judged as if it had: no orphans, no debt, no Health, no Discovery.
     */
    thoughtLabPath?: string;
}

/**
 * ZettelFlow's own folders (#713): always left out, before any rule and beyond any exception — the
 * flow canvases and their steps, the hook flows, the script library and the Thinking space.
 */
export function systemExcludedPaths(settings: ScopeSettings): string[] {
    const system = [settings.foldersFlowsPath, settings.jsLibraryFolderPath, settings.hooks?.folderFlowPath, settings.thoughtLabPath];
    return normalizeExcludedPaths(system.filter((p): p is string => typeof p === "string"));
}
