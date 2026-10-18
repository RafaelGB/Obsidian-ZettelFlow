import { log } from "architecture";
import { faceOf, type PdfFaces } from "application/library/pdfText";
import type { PdfPage, PdfTextItem } from "./pdfjs";

/**
 * **A document's fonts, read once each** (#839): whether each is bold or italic, from its real name.
 *
 * pdf.js says a run's font only by an id (`g_d1_f3`); its real name (`Times-Bold`) is known once the
 * page's operator list has loaded the font. So the first page reads its fonts beside its text, and a
 * later page waits for its operator list only when it brings a font not seen before. A font that cannot
 * be read is plain, and a document whose fonts cannot be read at all reads as it always did.
 */
export interface FaceReader {
    /** Start reading the fonts of a page before its text is in: only while no font is known yet. */
    early(page: PdfPage): Promise<unknown> | null;
    /** The faces of every font the page's items use. */
    read(page: PdfPage, items: readonly PdfTextItem[], early: Promise<unknown> | null): Promise<PdfFaces>;
}

export function faceReader(path: string): FaceReader {
    const faces: PdfFaces = {};
    let failed = false;
    const fail = (why: unknown) => {
        if (!failed) log.debug(`[Library] the fonts of ${path} cannot be read, bold and italic are not shown: ${String(why)}`);
        failed = true;
    };
    return {
        early(page) {
            if (failed || Object.keys(faces).length > 0 || !page.getOperatorList) return null;
            return page.getOperatorList().catch((error: unknown) => {
                fail(error);
                return null;
            });
        },
        async read(page, items, early) {
            const missing = [...new Set(items.map((item) => item.fontName).filter((name): name is string => Boolean(name) && !(name! in faces)))];
            if (failed || missing.length === 0 || !page.getOperatorList || !page.commonObjs) return faces;
            try {
                await (early ?? page.getOperatorList());
            } catch (error) {
                fail(error);
                return faces;
            }
            if (failed) return faces;
            for (const name of missing) {
                let real: string | undefined;
                try {
                    real = (page.commonObjs.get(name) as { name?: string } | null)?.name;
                } catch {
                    real = undefined;
                }
                faces[name] = faceOf(real);
            }
            return faces;
        },
    };
}
