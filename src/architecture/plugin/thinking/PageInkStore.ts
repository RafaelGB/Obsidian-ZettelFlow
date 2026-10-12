import { TFile } from "obsidian";
import { log } from "architecture/monitoring/Logger";
import { ObsidianApi } from "architecture/plugin/ObsidianAPI";
import { FileService } from "architecture/plugin/services/FileService";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import { emptyPageInk, mergePageInk, pageInkPath, parsePageInk, renderPageInk, type PageInk } from "application/reader/ink/pageInk";

/**
 * Where a book's page ink is kept (#790): one file per book in the thinking space's `ink/` folder.
 *
 * It is never a thought — Think reads only markdown — and the book itself is never written. A save
 * reads the file again first and merges with it, so ink another device synced in meanwhile is kept:
 * never last-writer-wins. A file this build cannot read is never written over.
 */
export class PageInkStore {
    private static instance: PageInkStore | undefined;

    public static getInstance(): PageInkStore {
        if (!PageInkStore.instance) PageInkStore.instance = new PageInkStore();
        return PageInkStore.instance;
    }

    /** What each file said when last read or written, and what that parsed to: no second parse of the same text. */
    private known = new Map<string, { text: string; doc: PageInk }>();

    public folder(): string {
        return ThoughtStore.getInstance().folder();
    }

    /** The book's page ink: empty when there is none yet, `null` without a thinking space or when unreadable. */
    public async load(about: string): Promise<PageInk | null> {
        const folder = this.folder();
        if (!folder) return null;
        return this.read(pageInkPath(folder, about), about);
    }

    /**
     * Keep the book's page ink: what is on disk, merged with `mine`, written once if it changed.
     * Returns the merged ink — what the caller holds from now — or `null` when nothing could be kept.
     */
    public async save(about: string, mine: PageInk, now = Date.now()): Promise<PageInk | null> {
        const folder = this.folder();
        if (!folder) return null;
        const path = pageInkPath(folder, about);
        let merged: PageInk | null = null;
        // Read, merge and write as one step: a sync landing in between is never overwritten.
        await FileService.rewriteFile(path, (content) => {
            const disk = content ? this.parse(path, content, about) : emptyPageInk(about);
            if (!disk) return null;
            merged = mergePageInk(disk, { ...mine, about }, now);
            const text = renderPageInk(merged);
            this.known.set(path, { text, doc: merged });
            // Unchanged on disk: nothing to write — and a file deleted meanwhile is made again.
            return text === content ? null : text;
        });
        return merged;
    }

    private async read(path: string, about: string): Promise<PageInk | null> {
        const file = ObsidianApi.vault().getFileByPath(path);
        if (!(file instanceof TFile)) return emptyPageInk(about);
        let text: string;
        try {
            text = await ObsidianApi.vault().cachedRead(file);
        } catch (error) {
            log.warn(`[Reader] could not read the page ink of ${about}: ${String(error)}`);
            return null;
        }
        return this.parse(path, text, about);
    }

    /** A file's text as page ink — parsed once per text — or `null` when this build cannot read it. */
    private parse(path: string, text: string, about: string): PageInk | null {
        const known = this.known.get(path);
        if (known?.text === text) return known.doc;
        const doc = parsePageInk(text);
        if ("unreadable" in doc) {
            log.warn(`[Reader] the page ink of ${about} is from a newer version or broken: it is left as it is`);
            return null;
        }
        this.known.set(path, { text, doc });
        return doc;
    }
}
