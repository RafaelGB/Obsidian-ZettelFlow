import { TFile, type App, type Component } from "obsidian";
import { sourceFormat, type SourceFormat } from "application/library/sourceMeta";
import type { CropBox, PageInk } from "application/library/pdfCrop";
import type { SpreadView } from "application/library/epubFixedLayout";
import { openPdfSource } from "./pdfSource";
import { openEpubSource } from "./epubSource";

/**
 * **A source, as the Reader reads it** (#681, #682, epic #675) — one Reader for everything (L2): a
 * PDF or an EPUB is a reading whose chapters are its pages or its spine items. The Reader asks a
 * source for its chapters and its contents, and to draw one chapter into the page; everything
 * else — the keys, the bar, the themes, the highlights, the end — is the Reader's own.
 *
 * Opening a source reads it through the Vault API and never writes it (L5).
 */

/**
 * How a chapter is drawn: reflowed into the Reader's column (Reading view), or the page as it was laid
 * out (Page view). Not the Reader's *layout* — Scroll, Page or Spread (#753) — which is how a reflowed
 * chapter is laid out on screen.
 */
export type SourceView = "reading" | "page";

export interface SourceChapter {
    /** How a reader cites it: `p. 42`, `Ch. 3 · The lazy controller`. */
    label: string;
    /** The section it sits in, when the source names one. */
    section?: string;
    /** A designed page (#771): it has no text to search, highlight or count. */
    designed?: true;
}

export interface SourceTocEntry {
    title: string;
    chapter: number;
    depth: number;
    /** The element it points at inside the chapter, when it names one. */
    fragment?: string;
}

/** What drawing a chapter gave: its words (for the minutes left), and whether it has text at all. */
export interface DrawnChapter {
    words: number;
    /** The chapter was drawn as a picture of its page: nothing in it can be highlighted. */
    picture: boolean;
    /** The language the chapter declares for itself, over the book's (#757). */
    language?: string;
    /** A designed page (#771): drawn as it was made, in its own boundary — nothing in it is read or kept. */
    designed?: boolean;
}

/** A link on a printed page (#767 FR-11, FR-12): where it sits on the page, as shares of it, and where it goes. */
export interface SourcePageLink {
    /** Left, top, width and height as shares (0–1) of the page as drawn at that turn. */
    rect: { x: number; y: number; w: number; h: number };
    /** A place in the paper (resolved by `destination`), or an address outside it — never followed (L1). */
    dest?: unknown;
    url?: string;
}

/** A drawing of a page under way: let go with `cancel` when the page has left the screen. */
export interface SourcePageTask {
    promise: Promise<void>;
    cancel(): void;
}

/**
 * **The printed pages of a source** (#767): what Page view's run of pages asks of a PDF, so the Reader
 * never touches pdf.js. Sizes are in PDF points with the page's own turn; `rotation` is the reader's
 * own quarter turns on top of it.
 */
export interface SourcePages {
    count: number;
    /** The first page's size, known at once: every page starts as it, until its own is read. */
    first: { width: number; height: number };
    size(index: number): Promise<{ width: number; height: number }>;
    /** How the paper names the page: its own label (*iv*, *12*), else its number. */
    label(index: number): string;
    /**
     * Draw the page into `canvas`, its pixels `scale` per point, turned `rotation` more — only its
     * `frame` when one is given (#769: shares of the page as drawn at that turn), so the margins
     * cropped away are never drawn at all.
     */
    render?(index: number, canvas: HTMLCanvasElement, options: { scale: number; rotation: number; frame?: CropBox }): SourcePageTask;
    /**
     * A designed page (#771), drawn **as elements** into `into` once, at its own size — the run scales
     * it, never draws it again. Cancelling the task (before or after it is drawn) lets go everything
     * it holds. A source has `render` or `mount`, never both.
     */
    mount?(index: number, into: HTMLElement): SourcePageTask;
    /**
     * In *Spread*, how the book pairs its pages (#771 FR-6): in landscape or not, and whether the reader
     * chose *Spread* themselves. Absent for a paper: page 1 alone, then pairs.
     */
    spreads?(landscape: boolean, explicit: boolean): SpreadView[];
    /** A right-to-left book's pages (#771): a pair's first page sits on the right of the spine. */
    direction?: "ltr" | "rtl";
    /**
     * What is printed on the page (#769): its text runs, its pictures and its drawn shapes, as boxes
     * on the page as drawn upright. Read once per page, when *Crop margins* asks.
     */
    ink?(index: number): Promise<PageInk>;
    links(index: number, rotation: number): Promise<SourcePageLink[]>;
    /** A link's destination: its page, and how far down it (0–1) when it says. */
    destination(dest: unknown, rotation?: (page: number) => number): Promise<{ page: number; share?: number } | null>;
}

export interface SourceDocument {
    format: SourceFormat;
    path: string;
    title: string;
    author?: string;
    chapters: SourceChapter[];
    toc: SourceTocEntry[];
    /** A PDF with no text layer (#681): readable, never highlightable. */
    imageOnly: boolean;
    /** Whether the source has a page layout worth keeping: PDFs do, EPUBs reflow by nature. */
    hasPageView: boolean;
    /** A book written right to left turns the other way (#753 FR-10). Left to right when absent. */
    direction?: "ltr" | "rtl";
    /** What the source is written in, when it says (#757): the column declares it, so it hyphenates by it. */
    language?: string;
    /** Draw chapter `index` into `body`. Anything it holds is let go with `component`. */
    draw(index: number, body: HTMLElement, component: Component, view: SourceView): Promise<DrawnChapter>;
    /**
     * Where a link inside a chapter leads, when it stays in the book: the chapter, and the element
     * it names. `null` for a link that leaves it — which the Reader never follows (L1).
     */
    resolveLink?(fromChapter: number, href: string): { chapter: number; fragment?: string } | null;
    /** A PDF's printed pages, for Page view's run of pages (#767) — or a fixed-layout book's (#771). */
    pages?: SourcePages;
    /**
     * A fixed-layout book (#771): every page designed. It is read as its pages, as a scan is — through
     * the run — and nothing in it can be highlighted or searched (FR-8).
     */
    designed?: boolean;
    close(): void;
}

/**
 * Open a PDF or an EPUB for reading. Throws when the file is not one, or cannot be read.
 * `imageOnly` is what the shelf already knows of a PDF, so a known scan is not sampled again.
 */
export async function openSourceDocument(app: App, path: string, imageOnly?: boolean): Promise<SourceDocument> {
    const format = sourceFormat(path);
    const file = app.vault.getAbstractFileByPath(path);
    if (!format || !(file instanceof TFile)) throw new Error(`not a source: ${path}`);
    return format === "pdf" ? openPdfSource(app, file, imageOnly) : openEpubSource(app, file);
}
