import type { App, TFile } from "obsidian";
import { log } from "architecture";
import { declaredFromPackage, declaredFromPdf, type DeclaredMetadata } from "application/library/bookNote";
import { sourceFormat } from "application/library/sourceMeta";
import { tooLarge } from "architecture/components/core/reader/readerDevice";
import { openEpub } from "./epub";
import { declared, openPdf } from "./pdfjs";

/**
 * **What a book says about itself** (#743 FR-5): an EPUB's package — creator, publisher, date,
 * language, identifier, series — or a PDF's info — title, author. Read once, when the book's note is
 * first created, and kept nowhere else: the settings never hold it (FR-11).
 *
 * Reads only, through the Vault API; never throws — a file that cannot be read declares nothing.
 */
export async function declaredMetadata(app: App, file: TFile): Promise<DeclaredMetadata> {
    const format = sourceFormat(file.path);
    if (!format || tooLarge(file.stat?.size, format)) return {};
    try {
        if (format === "epub") return declaredFromPackage((await openEpub(app, file)).pkg);
        const doc = await openPdf(app, file);
        try {
            const info: Record<string, unknown> = (await doc.getMetadata().catch(() => ({ info: {} }))).info ?? {};
            return declaredFromPdf({ title: declared(info.Title), author: declared(info.Author) });
        } finally {
            void doc.destroy().catch(() => undefined);
        }
    } catch (error) {
        log.debug(`[Library] nothing declared by ${file.path}: ${error instanceof Error ? error.message : String(error)}`);
        return {};
    }
}
