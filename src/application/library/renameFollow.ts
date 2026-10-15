import { inFolder } from "application/library/article";
import { renameSource, sourceFormat, type LibraryMeta } from "application/library/sourceMeta";

/**
 * **What follows a source's rename** (#810 FR-1) — pure, over the plugin data keyed by a path.
 *
 * A book moved into another folder, or given a better name, is the same book: the Library's place
 * and bookmarks, the layers it was read on and the readings it can be resumed at go with it. A
 * picked set is kept by a fingerprint that names no path, and is left alone.
 */

/** The plugin data a source's path keys. */
export interface FollowedSettings {
    library?: LibraryMeta;
    readerLayers?: Record<string, unknown>;
    readerResume?: Record<string, unknown>;
}

/** What a rename changes in it: nothing (`changed: false`), or the maps to write back. */
export type FollowedChange = { changed: false } | ({ changed: true } & FollowedSettings);

/** Whether a rename is a source's (#810 FR-1): a PDF, an EPUB, or an article in the articles folder. */
export function isFollowedSource(from: string, to: string, articles: string): boolean {
    if (sourceFormat(from) || sourceFormat(to)) return true;
    const md = (path: string) => path.toLowerCase().endsWith(".md");
    return md(to) && (inFolder(from, articles) || inFolder(to, articles));
}

/** A map with `from`'s entry under `to` — or the map itself when `from` is not in it. */
function moved<T>(map: Record<string, T> | undefined, from: string, to: string): Record<string, T> | undefined {
    if (!map || !(from in map)) return map;
    const next: Record<string, T> = {};
    for (const [key, value] of Object.entries(map)) if (key !== from) next[key] = value;
    next[to] = map[from];
    return next;
}

/** Resume entries keyed `<kind>:<path>`: each one naming `from` is named `to`. A fingerprint is kept. */
function movedResume(map: Record<string, unknown> | undefined, from: string, to: string): Record<string, unknown> | undefined {
    if (!map) return map;
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(map)) {
        const colon = key.indexOf(":");
        const kind = colon >= 0 ? key.slice(0, colon) : "";
        if (kind && kind !== "selection" && key.slice(colon + 1) === from) {
            next[`${kind}:${to}`] = value;
            changed = true;
        } else next[key] = value;
    }
    return changed ? next : map;
}

/**
 * A thought's file, about `to` where it was about `from` (#810 FR-7): only the `about` and
 * `alsoAbout` lines of its frontmatter change — its text, passage, meaning, layer, claims and review
 * stay byte for byte. `null` when the file names `from` in neither.
 */
export function reaboutText(content: string, from: string, to: string): string | null {
    const lines = content.split("\n");
    if (lines[0] !== "---") return null;
    let changed = false;
    for (let i = 1; i < lines.length && lines[i] !== "---"; i++) {
        const match = /^(\s+(?:about|alsoAbout): )(.*)$/.exec(lines[i]);
        if (match && match[2] === from) {
            lines[i] = `${match[1]}${to}`;
            changed = true;
        }
    }
    return changed ? lines.join("\n") : null;
}

/** What `from` → `to` changes in the plugin data (#810 FR-1, FR-3): nothing for a book with no state. */
export function followSettings(settings: FollowedSettings, from: string, to: string): FollowedChange {
    const library = settings.library ? renameSource(settings.library, from, to) : settings.library;
    const readerLayers = moved(settings.readerLayers, from, to);
    const readerResume = movedResume(settings.readerResume, from, to);
    if (library === settings.library && readerLayers === settings.readerLayers && readerResume === settings.readerResume) return { changed: false };
    return {
        changed: true,
        ...(library ? { library } : {}),
        ...(readerLayers ? { readerLayers } : {}),
        ...(readerResume ? { readerResume } : {}),
    };
}
