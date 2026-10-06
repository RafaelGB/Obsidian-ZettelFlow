import { loadPdfJs, type App, type TFile } from "obsidian";

/**
 * **Obsidian's own pdf.js** (#680, #681, epic #675) — loaded through the public `loadPdfJs()` (L3),
 * so the Library adds nothing to the bundle to read a PDF and reads it with the same engine
 * Obsidian's PDF view uses.
 *
 * `loadPdfJs()` resolves to the `pdfjsLib` Obsidian loads from its own `/lib/pdfjs/`, with the
 * worker already pointed at its own copy (checked against the 1.14 bundle, pdf.js 5.3). The few
 * calls the Library makes are typed here, so the rest of the plugin never touches `any`.
 */

export interface PdfTextItem {
    str: string;
    /** `[a, b, c, d, x, y]`: `x`, `y` place the run on the page; `d` is roughly its size. */
    transform: number[];
    width: number;
    height: number;
    hasEOL?: boolean;
}

export interface PdfViewport {
    width: number;
    height: number;
}

export interface PdfPage {
    getViewport(options: { scale: number }): PdfViewport;
    getTextContent(): Promise<{ items: (PdfTextItem | { type: string })[] }>;
    render(options: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }): { promise: Promise<void>; cancel(): void };
    cleanup?(): void;
}

export interface PdfOutlineNode {
    title: string;
    dest: string | unknown[] | null;
    items: PdfOutlineNode[];
}

export interface PdfDocument {
    numPages: number;
    getPage(pageNumber: number): Promise<PdfPage>;
    getMetadata(): Promise<{ info?: Record<string, unknown> }>;
    getOutline(): Promise<PdfOutlineNode[] | null>;
    getDestination(name: string): Promise<unknown[] | null>;
    getPageIndex(ref: unknown): Promise<number>;
    destroy(): Promise<void>;
}

interface PdfJsLib {
    getDocument(source: Record<string, unknown>): { promise: Promise<PdfDocument>; destroy?(): Promise<void> };
}

/**
 * Open a PDF in the vault. The bytes are read through the Vault API and handed to pdf.js as data —
 * no URL, nothing fetched. The fonts and character maps it may ask for are Obsidian's own, local.
 */
export async function openPdf(app: App, file: TFile): Promise<PdfDocument> {
    const lib = (await loadPdfJs()) as PdfJsLib;
    const data = new Uint8Array(await app.vault.readBinary(file));
    return lib.getDocument({
        data,
        cMapUrl: "/lib/pdfjs/cmaps/",
        cMapPacked: true,
        standardFontDataUrl: "/lib/pdfjs/standard_fonts/",
        isEvalSupported: false,
    }).promise;
}

/** Whether a pdf.js text item carries words (the API mixes in marked-content markers). */
export function isTextItem(item: PdfTextItem | { type: string }): item is PdfTextItem {
    return typeof (item as PdfTextItem).str === "string";
}

/**
 * A title or author a PDF declares, when it is one: many carry the name of the program that made
 * them (*Microsoft Word - draft.docx*) or nothing useful at all.
 */
export function declared(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const clean = value.replace(/\s+/g, " ").trim();
    if (!clean || clean.length < 2 || /^untitled$/i.test(clean)) return undefined;
    if (/\.(docx?|pdf|tex|dvi|indd|rtf|odt|pages)$/i.test(clean) || /^microsoft (word|powerpoint)/i.test(clean)) return undefined;
    return clean;
}
