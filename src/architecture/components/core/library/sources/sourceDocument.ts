import { TFile, type App, type Component } from "obsidian";
import { sourceFormat, type SourceFormat } from "application/library/sourceMeta";
import { openPdfSource } from "./pdfSource";

/**
 * **A source, as the Reader reads it** (#681, #682, epic #675) — one Reader for everything (L2): a
 * PDF or an EPUB is a reading whose chapters are its pages or its spine items. The Reader asks a
 * source for its chapters and its contents, and to draw one chapter into the page; everything
 * else — the keys, the bar, the themes, the highlights, the end — is the Reader's own.
 *
 * Opening a source reads it through the Vault API and never writes it (L5).
 */

/** How a chapter is drawn: reflowed into the Reader's column, or the page as it was laid out. */
export type SourceLayout = "reading" | "page";

export interface SourceChapter {
    /** How a reader cites it: `p. 42`, `Ch. 3 · The lazy controller`. */
    label: string;
    /** The section it sits in, when the source names one. */
    section?: string;
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
    /** Draw chapter `index` into `body`. Anything it holds is let go with `component`. */
    draw(index: number, body: HTMLElement, component: Component, layout: SourceLayout): Promise<DrawnChapter>;
    /**
     * Where a link inside a chapter leads, when it stays in the book: the chapter, and the element
     * it names. `null` for a link that leaves it — which the Reader never follows (L1).
     */
    resolveLink?(fromChapter: number, href: string): { chapter: number; fragment?: string } | null;
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
    if (format === "pdf") return openPdfSource(app, file, imageOnly);
    throw new Error(`no reader for ${format} yet`);
}
