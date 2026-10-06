import type { App, Component, TFile } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { IMAGE_ONLY_SAMPLE, isImageOnly, reflowPage, runOf } from "application/library/pdfText";
import { titleFromName } from "application/library/shelf";
import { declared, isTextItem, openPdf, type PdfDocument, type PdfOutlineNode } from "./pdfjs";
import type { DrawnChapter, SourceDocument, SourceLayout, SourceTocEntry } from "./sourceDocument";

/** The widest a page is drawn at, in CSS pixels — the Reader's column, and a little more. */
const PAGE_WIDTH = 760;

/** A page with fewer letters than this reads as a picture: a figure, a plate, a scanned page. */
const PICTURE_LETTERS = 24;

/** The outline, flattened, each entry with the page it points at. Never throws. */
async function outlineOf(doc: PdfDocument): Promise<SourceTocEntry[]> {
    const out: SourceTocEntry[] = [];
    let outline: PdfOutlineNode[] | null = null;
    try {
        outline = await doc.getOutline();
    } catch (error) {
        log.debug(`[Library] no outline: ${String(error)}`);
    }
    const walk = async (nodes: PdfOutlineNode[], depth: number) => {
        for (const node of nodes) {
            try {
                const dest = typeof node.dest === "string" ? await doc.getDestination(node.dest) : node.dest;
                const ref = Array.isArray(dest) ? dest[0] : null;
                if (ref !== null && ref !== undefined && node.title?.trim()) {
                    const chapter = typeof ref === "number" ? ref : await doc.getPageIndex(ref);
                    out.push({ title: node.title.replace(/\s+/g, " ").trim(), chapter, depth });
                }
            } catch (error) {
                log.debug(`[Library] an outline entry points nowhere: ${String(error)}`);
            }
            if (node.items?.length) await walk(node.items, depth + 1);
        }
    };
    if (outline) await walk(outline, 0);
    return out;
}

/** The section a page sits in: the last top-level outline entry at or before it. */
function sectionOf(toc: readonly SourceTocEntry[], page: number): string | undefined {
    let found: string | undefined;
    for (const entry of toc) if (entry.chapter <= page && entry.depth <= 1) found = entry.title;
    return found;
}

/**
 * **A PDF in the Reader** (#681, epic #675): chapters are its pages. A page with text is reflowed
 * into the Reader's own column — your font, your size, your theme — so it can be read and
 * highlighted like a note. **Page view** draws the page as it was laid out, for a paper whose
 * figures matter; it is read-only. A page with no text — a figure, or every page of a scan — is
 * drawn as its picture either way.
 */
export async function openPdfSource(app: App, file: TFile, imageOnlyKnown?: boolean): Promise<SourceDocument> {
    const doc = await openPdf(app, file);
    const info: Record<string, unknown> = (await doc.getMetadata().catch(() => ({ info: {} }))).info ?? {};
    const toc = await outlineOf(doc);
    const chapters = Array.from({ length: doc.numPages }, (_, i) => {
        const section = sectionOf(toc, i);
        return { label: t("reader_source_page", String(i + 1)), ...(section ? { section } : {}) };
    });
    let imageOnly = imageOnlyKnown ?? false;
    if (imageOnlyKnown === undefined) {
        // The shelf may not have sampled it yet: a scan is known before its first page is drawn.
        const samples: string[] = [];
        for (let n = 1; n <= Math.min(IMAGE_ONLY_SAMPLE, doc.numPages); n++) {
            const content = await (await doc.getPage(n)).getTextContent();
            samples.push(content.items.filter(isTextItem).map((item) => item.str).join(""));
        }
        imageOnly = isImageOnly(samples);
    }

    const drawPicture = async (index: number, body: HTMLElement, component: Component): Promise<void> => {
        const page = await doc.getPage(index + 1);
        const base = page.getViewport({ scale: 1 });
        const width = Math.min(PAGE_WIDTH, body.clientWidth || PAGE_WIDTH);
        const ratio = (body.ownerDocument?.defaultView?.devicePixelRatio ?? 1) || 1;
        const viewport = page.getViewport({ scale: (width * ratio) / Math.max(1, base.width) });
        const canvas = body.createEl("canvas", {
            cls: c("reader-page-picture"),
            attr: {
                width: Math.round(viewport.width),
                height: Math.round(viewport.height),
                role: "img",
                "aria-label": t("reader_source_page_picture", String(index + 1)),
            },
        });
        const context = canvas.getContext?.("2d");
        if (!context) return;
        const task = page.render({ canvasContext: context, viewport });
        component.register(() => task.cancel());
        await task.promise.catch((error: unknown) => {
            // Turning the page cancels the drawing of the last one; that is not a failure.
            if (!/cancel/i.test(String(error))) throw error;
        });
    };

    return {
        format: "pdf",
        path: file.path,
        title: declared(info.Title) ?? titleFromName(file.name),
        ...(declared(info.Author) ? { author: declared(info.Author) } : {}),
        chapters,
        toc,
        imageOnly,
        hasPageView: !imageOnly,
        async draw(index: number, body: HTMLElement, component: Component, layout: SourceLayout): Promise<DrawnChapter> {
            if (layout === "page" || imageOnly) {
                await drawPicture(index, body, component);
                return { words: 0, picture: true };
            }
            const page = await doc.getPage(index + 1);
            const content = await page.getTextContent();
            const blocks = reflowPage(content.items.filter(isTextItem).map(runOf));
            const text = blocks.map((block) => block.text).join(" ");
            if (text.replace(/[^\p{L}]/gu, "").length < PICTURE_LETTERS) {
                // A page that is a figure: its picture is what there is to read.
                await drawPicture(index, body, component);
                return { words: 0, picture: true };
            }
            for (const block of blocks) body.createEl(block.kind === "heading" ? "h2" : "p", { text: block.text });
            return { words: text.split(/\s+/).filter(Boolean).length, picture: false };
        },
        close(): void {
            void doc.destroy().catch(() => undefined);
        },
    };
}
