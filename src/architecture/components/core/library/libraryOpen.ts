import type { App } from "obsidian";
import type { ShelfItem } from "application/library/shelf";
import { openReader } from "architecture/components/core/reader/openReader";
import { normalizeResume, readingKey, resumeOf } from "architecture/components/core/reader/readerResume";
import type { LibraryHost } from "./libraryHost";

/** Where to land inside what is opened: a chapter, or one highlight in it. */
export interface OpenAt {
    chapter?: number;
    highlight?: string;
}

/** The formats the Reader reads (#681, #682). */
export const READABLE: readonly string[] = ["pdf", "epub"];

/**
 * Open something on the shelf (#680) — in the Reader, where you left it (#681): a saved path at its
 * chapter, a source at its page or chapter, or at one highlight. Returns `false` for what cannot be
 * opened, so the caller can show its detail instead.
 */
export function openShelfItem(app: App, item: ShelfItem, host: LibraryHost | null, at: OpenAt = {}): boolean {
    if (item.kind === "path" && item.paths && item.seed) {
        const place = resumeOf(normalizeResume(host?.settings?.readerResume), readingKey("selection", item.seed, item.paths));
        void openReader(app, {
            seed: item.seed,
            kind: "selection",
            paths: item.paths,
            name: item.title,
            chapter: at.chapter ?? place?.chapter ?? 0,
            ...(at.highlight ? { highlight: at.highlight } : {}),
        });
        return true;
    }
    if (item.file && READABLE.includes(item.format)) {
        void openReader(app, {
            seed: item.file,
            source: item.file,
            chapter: at.chapter ?? item.place ?? 0,
            ...(at.highlight ? { highlight: at.highlight } : {}),
        });
        return true;
    }
    return false;
}
