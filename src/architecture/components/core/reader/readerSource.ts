import { TFile, type App } from "obsidian";
import { log } from "architecture";
import type { ReadingPath } from "architecture/knowledge/state";
import { freshPageView, isFresh, normalizeLibrary, withBookmarks, withChosenView, withFacts, withPageView, withPlace, withRead, type SourceMeta, withScroll } from "application/library/sourceMeta";
import { isHighlight } from "application/thinking/thought";
import type { PageViewState } from "architecture/components/core/library/sources/pdfPageView";
import type { Bookmark } from "./readerBookmarks";
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

/** The book's bookmarks (#761): what the Library keeps, in reading order. */
export function sourceBookmarks(host: ReaderHost | undefined, path: string): Bookmark[] {
    return normalizeLibrary(host?.settings?.library)[path]?.bookmarks ?? [];
}

/**
 * Keep the book's bookmarks beside its place, in plugin data (#761 FR-2) — never in Think, never in
 * a note, never in the book's file.
 */
export function rememberSourceBookmarks(app: App, host: ReaderHost | undefined, path: string, list: readonly Bookmark[]): void {
    const settings = host?.settings;
    if (!settings) return;
    const file = app.vault.getAbstractFileByPath(path);
    const stat = file instanceof TFile ? file.stat : undefined;
    settings.library = withBookmarks(normalizeLibrary(settings.library), path, list, stat?.size ?? 0, stat?.mtime ?? 0);
    void host?.saveSettings?.()?.catch?.((error: unknown) => log.error(`[Reader] could not keep the bookmark: ${String(error)}`));
}

/**
 * How the paper is read in Page view (#767 FR-5): its zoom or fit, its direction, its turned pages,
 * and whether its margins are cropped — with the frames measured, when they were measured on this
 * very file (#769 FR-6).
 */
export function keptPageView(app: App, host: ReaderHost | undefined, path: string): PageViewState {
    const view = normalizeLibrary(host?.settings?.library)[path]?.view;
    const file = app.vault.getAbstractFileByPath(path);
    const stat = file instanceof TFile ? file.stat : undefined;
    return freshPageView(view, stat?.size ?? 0, stat?.mtime ?? 0);
}

/** Keep how the paper is read in Page view, in plugin data beside its place — never in the PDF (L5). */
export function rememberPageView(app: App, host: ReaderHost | undefined, path: string, view: PageViewState): void {
    const settings = host?.settings;
    if (!settings) return;
    const file = app.vault.getAbstractFileByPath(path);
    const stat = file instanceof TFile ? file.stat : undefined;
    settings.library = withPageView(normalizeLibrary(settings.library), path, view, stat?.size ?? 0, stat?.mtime ?? 0);
    void host?.saveSettings?.()?.catch?.((error: unknown) => log.error(`[Reader] could not keep the page view: ${String(error)}`));
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
    // A copy read before the first-view suggestion existed (#813) is given it once, too.
    // And one read before it kept whether it is typewritten (#851): with it, opening reads no page again.
    const missing = (doc.suggestedView !== undefined && map[doc.path]?.suggestedView === undefined) || (doc.typewritten !== undefined && map[doc.path]?.typewritten === undefined);
    if (isFresh(map[doc.path], file.stat.size, file.stat.mtime) && !missing) return;
    settings.library = withFacts(
        map,
        doc.path,
        {
            title: doc.title,
            ...(doc.author ? { author: doc.author } : {}),
            chapters: doc.chapters.length,
            ...(doc.imageOnly ? { imageOnly: true } : {}),
            ...(doc.suggestedView ? { suggestedView: doc.suggestedView } : {}),
            ...(doc.typewritten !== undefined ? { typewritten: doc.typewritten } : {}),
        },
        file.stat.size,
        file.stat.mtime
    );
}

/**
 * **The view a source opens in** (#813 FR-20 – FR-25): what the tab or the link says, else the view
 * you chose for it, else the one its first pages suggest, else reflowed. A scan and a source with no
 * page layout read as they always have.
 */
export function firstSourceView(doc: Pick<SourceDocument, "hasPageView" | "suggestedView">, meta: Pick<SourceMeta, "chosenView" | "suggestedView"> | undefined, explicit?: "page" | "reading"): "page" | "reading" {
    if (!doc.hasPageView) return "reading";
    return explicit ?? meta?.chosenView ?? doc.suggestedView ?? meta?.suggestedView ?? "reading";
}

/** The view you chose for a source by turning Page view on or off (#813 FR-22): only that is written. */
export function rememberSourceView(app: App, host: ReaderHost | undefined, path: string, view: "page" | "reading"): void {
    const settings = host?.settings;
    if (!settings) return;
    const file = app.vault.getAbstractFileByPath(path);
    const stat = file instanceof TFile ? file.stat : undefined;
    const map = normalizeLibrary(settings.library);
    if (map[path]?.chosenView === view) return;
    settings.library = withChosenView(map, path, view, stat?.size ?? 0, stat?.mtime ?? 0);
    void host?.saveSettings?.()?.catch?.((error: unknown) => log.error(`[Reader] could not keep the view: ${String(error)}`));
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

/** The chapters of a source read to their end (#776 P1): the overview fills their hairline. */
export function chaptersRead(host: ReaderHost | undefined, path: string): Set<number> {
    return new Set(normalizeLibrary(host?.settings?.library)[path]?.read ?? []);
}

/** Keep a chapter read to its end (#776 P1), in plugin data beside the place — never a note. */
export function rememberChapterRead(app: App, host: ReaderHost | undefined, path: string, chapter: number, total: number): void {
    const settings = host?.settings;
    if (!settings) return;
    const map = normalizeLibrary(settings.library);
    const file = app.vault.getAbstractFileByPath(path);
    const stat = file instanceof TFile ? file.stat : undefined;
    const next = withRead(map, path, chapter, total, stat?.size ?? 0, stat?.mtime ?? 0);
    if (next === map) return;
    settings.library = next;
    void host?.saveSettings?.()?.catch?.((error: unknown) => log.error(`[Reader] could not keep the chapter read: ${String(error)}`));
}

/**
 * The book's marks for its overview (#776 D9): each highlight and each ink note, by the part of the
 * book it is in. A move's answer is not a mark (#756). Read, never written; nothing on failure.
 */
export async function overviewMarksOf(
    path: string,
    store: { highlightsAbout(path: string): Promise<Thought[]> } = ThoughtStore.getInstance()
): Promise<{ at: number; meaning?: Thought["meaning"]; ink?: boolean; quote?: string }[]> {
    try {
        return (await store.highlightsAbout(path))
            .filter((thought) => thought.locator && (isHighlight(thought) || thought.ink))
            .map((thought) => ({
                at: thought.locator!.at,
                ...(thought.meaning ? { meaning: thought.meaning } : {}),
                ...(thought.ink ? { ink: true } : {}),
                ...(thought.quote?.exact ? { quote: thought.quote.exact } : {}),
            }));
    } catch (error) {
        log.debug(`[Reader] no marks for the overview of ${path}: ${String(error)}`);
        return [];
    }
}
