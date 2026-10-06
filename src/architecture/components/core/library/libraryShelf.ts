import { TFile, type App } from "obsidian";
import { log } from "architecture";
import { KnowledgeIndex } from "architecture/knowledge";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import { bornCounts, notesBornFrom } from "application/library/born";
import { buildShelf, type ShelfItem } from "application/library/shelf";
import { normalizeLibrary, sourceFormat, type LibraryMeta } from "application/library/sourceMeta";
import { normalizeSaved } from "architecture/components/core/reader/readerSaved";
import { normalizeResume, readingKey, resumeOf } from "architecture/components/core/reader/readerResume";
import type { LibraryHost } from "./libraryHost";

/**
 * The Library's one impure step (#680): read what the shelf is built from — the PDFs and EPUBs in
 * the vault, what plugin data remembers about them, the saved readings and where each was left,
 * the highlight counts (from the metadata cache) and the notes citing each source (from the model)
 * — and hand it to the pure shelf. Reads only.
 */
export interface Shelf {
    items: ShelfItem[];
    /** The notes citing each source, by path. */
    born: Map<string, string[]>;
    meta: LibraryMeta;
}

/** Every PDF and EPUB in the vault. */
export function sourceFiles(app: App): TFile[] {
    return app.vault.getFiles().filter((file) => file instanceof TFile && sourceFormat(file.path) !== null);
}

export function gatherShelf(app: App, host: LibraryHost | null): Shelf {
    const settings = host?.settings;
    const meta = normalizeLibrary(settings?.library);
    const saved = normalizeSaved(settings?.readerSaved);
    const resume = normalizeResume(settings?.readerResume);
    const pathPlaces = new Map<string, { chapter: number; total: number; at: number }>();
    for (const entry of saved) {
        const place = resumeOf(resume, readingKey("selection", entry.seed, entry.paths));
        if (place) pathPlaces.set(entry.id, place);
    }
    let highlights = new Map<string, number>();
    try {
        highlights = ThoughtStore.getInstance().highlightCounts();
    } catch (error) {
        log.debug(`[Library] no highlight counts: ${String(error)}`);
    }
    const index = KnowledgeIndex.getInstance();
    const born = index.status === "ready" ? notesBornFrom(index.getModel().all()) : new Map<string, string[]>();
    const items = buildShelf({
        sources: sourceFiles(app).map((file) => ({ path: file.path, basename: file.name })),
        meta,
        saved,
        pathPlaces,
        highlights,
        born: bornCounts(born),
    });
    return { items, born, meta };
}
