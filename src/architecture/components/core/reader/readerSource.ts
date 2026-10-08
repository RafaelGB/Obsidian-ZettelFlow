import { TFile, type App } from "obsidian";
import { log } from "architecture";
import type { ReadingPath } from "architecture/knowledge/state";
import { isFresh, normalizeLibrary, withFacts, withPlace, type SourceMeta, withScroll } from "application/library/sourceMeta";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import type { Thought } from "application/thinking/thought";
import type { SourceDocument } from "architecture/components/core/library/sources/sourceDocument";
import type { ReaderHost } from "./readerHost";

/**
 * The Reader's side of a source (#681, #682): a PDF or an EPUB read as a path whose chapters are
 * its pages or spine items, and the little the Library keeps about it — what the file declares and
 * where you are — in plugin data. Never the file (L5), never a note.
 */

/** A source as a reading path: one chapter per page or spine item, all of the same file. */
export function sourceReading(doc: SourceDocument): ReadingPath {
    return { seed: doc.path, kind: "selection", chapters: doc.chapters.map(() => ({ path: doc.path, role: "context" as const })) };
}

/** What the Library knows about a source. */
export function sourceMetaOf(host: ReaderHost | undefined, path: string): SourceMeta | undefined {
    return normalizeLibrary(host?.settings?.library)[path];
}

/** Remember where you are in a source — the Library's *Continue reading* reads it. */
export function rememberSourcePlace(app: App, host: ReaderHost | undefined, path: string, chapter: number, total: number): void {
    const settings = host?.settings;
    if (!settings) return;
    const file = app.vault.getAbstractFileByPath(path);
    const stat = file instanceof TFile ? file.stat : undefined;
    settings.library = withPlace(normalizeLibrary(settings.library), path, chapter, total, Date.now(), stat?.size ?? 0, stat?.mtime ?? 0);
    void host?.saveSettings?.()?.catch?.((error: unknown) => log.error(`[Reader] could not keep the place: ${String(error)}`));
}

/** How far into the chapter you are, for the next resume to land there — not at the chapter's top. */
export function rememberSourceScroll(app: App, host: ReaderHost | undefined, path: string, chapter: number, total: number, share: number): void {
    const settings = host?.settings;
    if (!settings) return;
    let map = normalizeLibrary(settings.library);
    // Opened straight on a chapter and never turned: the place itself is kept first.
    if (map[path]?.chapter !== chapter) {
        const file = app.vault.getAbstractFileByPath(path);
        const stat = file instanceof TFile ? file.stat : undefined;
        map = withPlace(map, path, chapter, total, Date.now(), stat?.size ?? 0, stat?.mtime ?? 0);
    }
    const next = withScroll(map, path, chapter, share);
    settings.library = next;
    void host?.saveSettings?.()?.catch?.((error: unknown) => log.error(`[Reader] could not keep the place: ${String(error)}`));
}

/** The share of `chapter` a resume should land on, when that is the chapter the place was kept for. */
export function keptScroll(host: ReaderHost | undefined, path: string, chapter: number): number | null {
    const meta = normalizeLibrary(host?.settings?.library)[path];
    return meta && meta.chapter === chapter && meta.scroll !== undefined ? meta.scroll : null;
}

/** Keep what opening a source told about it, when the shelf had not read it yet. */
export function rememberSourceFacts(app: App, host: ReaderHost | undefined, doc: SourceDocument): void {
    const settings = host?.settings;
    const file = app.vault.getAbstractFileByPath(doc.path);
    if (!settings || !(file instanceof TFile)) return;
    const map = normalizeLibrary(settings.library);
    if (isFresh(map[doc.path], file.stat.size, file.stat.mtime)) return;
    settings.library = withFacts(
        map,
        doc.path,
        { title: doc.title, ...(doc.author ? { author: doc.author } : {}), chapters: doc.chapters.length, ...(doc.imageOnly ? { imageOnly: true } : {}) },
        file.stat.size,
        file.stat.mtime
    );
}

/** The chapter a highlight of a source was made in, when a deep link names one (#681). */
export async function chapterOfHighlight(
    path: string,
    id: string,
    store: { highlightsAbout(path: string): Promise<Thought[]> } = ThoughtStore.getInstance()
): Promise<number | null> {
    try {
        const found = (await store.highlightsAbout(path)).find((thought) => thought.id === id);
        return found?.locator ? found.locator.at : null;
    } catch (error) {
        log.debug(`[Reader] no highlight ${id} in ${path}: ${String(error)}`);
        return null;
    }
}
