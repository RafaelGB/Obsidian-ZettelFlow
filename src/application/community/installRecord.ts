import { fnv1a8 } from "application/reader/ink/pageInk";
import type { InstallRole } from "./installDestination";

/**
 * **The install record** (#799 FR-14, epic #797) — pure.
 *
 * Installing a system wrote files and remembered nothing: the batch lived in an in-memory buffer
 * for two minutes (#511), so the gallery could never say a system was already in your vault, and
 * there was nothing to take it back with once the buffer had moved on.
 *
 * Each install is now one small, mechanical fact in `data.json`: which system, when, where, with
 * which role, the setting it changed and what that setting held before, and every file it wrote with
 * a content hash — so a later take-back moves to the trash only what you have not touched since. It
 * is not interpretive output (§XII) and has no form (§XIII): nothing here is a judgement, and
 * nobody authors it.
 */

export interface InstalledSystem {
    id: string;
    /** The gallery ref, e.g. `/docs/systems/zettelkasten-v2.zftemplate`. */
    ref: string;
    name: string;
    at: number;
    folder: string;
    /** The canvas path, as written. */
    canvas: string;
    role: InstallRole;
    /** The setting the role wrote, and what it held before. */
    setting?: { key: "ribbonCanvas" | "editorCanvas"; previous: string; value: string };
    files: { path: string; hash: string; size: number }[];
    /** The folders this install created — taken back only when they are empty. */
    folders: string[];
    /** The write-record batch, for an exact undo while it is still in memory (#453). */
    batch?: string;
}

/** Keys sorted all the way down, so two layouts of the same JSON read the same. */
function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    if (value && typeof value === "object") {
        const entries = Object.keys(value as Record<string, unknown>)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`);
        return `{${entries.join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}

/**
 * A file's content hash. A canvas is hashed by what it **says** — parsed and re-written with sorted
 * keys — so Obsidian re-formatting it on open does not count as you changing it. A note is its text.
 */
export function canonicalHash(path: string, content: string): string {
    if (path.endsWith(".canvas")) {
        try {
            return fnv1a8(canonicalJson(JSON.parse(content)));
        } catch {
            // Not JSON after all: hashed as the text it is.
        }
    }
    return fnv1a8(content);
}

export function addInstall(list: readonly InstalledSystem[] | undefined, entry: InstalledSystem): InstalledSystem[] {
    return [...(list ?? []), entry];
}

export function dropInstall(list: readonly InstalledSystem[] | undefined, id: string): InstalledSystem[] {
    return (list ?? []).filter((entry) => entry.id !== id);
}

/** Every install of one gallery system, oldest first. */
export function installsOf(list: readonly InstalledSystem[] | undefined, ref: string): InstalledSystem[] {
    return (list ?? []).filter((entry) => entry.ref === ref);
}

/** `base`, else `base 2`, `base 3`… — the first that is not `taken`: *Install another copy* (FR-12). */
export function nextFreeFolder(base: string, taken: (path: string) => boolean): string {
    if (!taken(base)) return base;
    for (let n = 2; n < 1000; n++) {
        const candidate = `${base} ${n}`;
        if (!taken(candidate)) return candidate;
    }
    return `${base} ${Date.now()}`;
}
