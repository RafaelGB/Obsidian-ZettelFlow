import type { App, Component, TFile } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { IMAGE_ONLY_SAMPLE, isImageOnly, reflowPage, runOf } from "application/library/pdfText";
import { pageWordsOf, type PageText } from "application/library/pdfWords";
import { titleFromName } from "application/library/shelf";
import { languageTag } from "application/library/sourceMeta";
import { cropOpsOf, measurePage, type CropBox, type PageInk } from "application/library/pdfCrop";
import { declared, isTextItem, openPdf, pdfOps, type PdfDocument, type PdfOutlineNode, type PdfPage } from "./pdfjs";
import type { DrawnChapter, SourceDocument, SourcePageLink, SourcePages, SourcePageTask, SourceView, SourceTocEntry } from "./sourceDocument";
import { resolveDest, shareDown } from "./pdfPageView";

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

/** The labels the PDF gives its pages, when it gives them and they say more than the page's number. */
async function labelsOf(doc: PdfDocument): Promise<string[] | null> {
    try {
        const labels = (await doc.getPageLabels?.()) ?? null;
        if (!Array.isArray(labels) || labels.length !== doc.numPages) return null;
        return labels.some((label, i) => label !== String(i + 1)) ? labels.map((label, i) => (typeof label === "string" && label.trim() ? label.trim() : String(i + 1))) : null;
    } catch (error) {
        log.debug(`[Library] no page labels: ${String(error)}`);
        return null;
    }
}

/** A canvas's 2D context — absent where the platform cannot draw one. */
function contextOf(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
    return (canvas as Partial<HTMLCanvasElement>).getContext?.("2d") ?? null;
}

/** A cancelled drawing is not a failure: a page that left the screen was let go on purpose. */
function quietCancel(error: unknown): void {
    if (!/cancel/i.test(String(error))) throw error;
}

/**
 * The printed pages of a PDF (#767): sizes read as they are asked for, its own labels, drawings that
 * can be let go, and its links — where they sit and where they go. pdf.js stays behind this seam.
 */
function pagesOf(doc: PdfDocument, first: { width: number; height: number }, labels: string[] | null): SourcePages {
    const sizes = new Map<number, Promise<{ width: number; height: number }>>();
    const page = (index: number): Promise<PdfPage> => doc.getPage(index + 1);
    const turn = (p: PdfPage, rotation: number) => (((p.rotate ?? 0) + rotation) % 360 + 360) % 360;
    return {
        count: doc.numPages,
        first,
        size(index: number) {
            let known = sizes.get(index);
            if (!known) {
                known = page(index).then((p) => {
                    const box = p.getViewport({ scale: 1 });
                    return { width: box.width, height: box.height };
                });
                sizes.set(index, known);
            }
            return known;
        },
        label(index: number): string {
            return labels?.[index] ?? String(index + 1);
        },
        render(index: number, canvas: HTMLCanvasElement, options: { scale: number; rotation: number; frame?: CropBox }): SourcePageTask {
            let cancelled = false;
            let inner: { cancel(): void } | null = null;
            const promise = (async () => {
                const p = await page(index);
                if (cancelled) return;
                const rotation = turn(p, options.rotation);
                const whole = p.getViewport({ scale: options.scale, rotation });
                const frame = options.frame;
                // A cropped page (#769): the viewport is moved so the frame's corner is the canvas's,
                // and the canvas is the frame's size — the margins are never drawn.
                const viewport = frame
                    ? p.getViewport({ scale: options.scale, rotation, offsetX: -frame.x * whole.width, offsetY: -frame.y * whole.height })
                    : whole;
                const context = contextOf(canvas);
                if (!context) return;
                canvas.width = Math.max(1, Math.round(frame ? frame.w * whole.width : viewport.width));
                canvas.height = Math.max(1, Math.round(frame ? frame.h * whole.height : viewport.height));
                const task = p.render({ canvasContext: context, viewport });
                inner = task;
                await task.promise.catch(quietCancel);
            })();
            return {
                promise,
                cancel: () => {
                    cancelled = true;
                    inner?.cancel();
                },
            };
        },
        async ink(index: number): Promise<PageInk> {
            const p = await page(index);
            const viewport = p.getViewport({ scale: 1, rotation: turn(p, 0) });
            const convert = viewport.convertToViewportRectangle?.bind(viewport);
            const [content, list, ops] = await Promise.all([p.getTextContent(), p.getOperatorList?.() ?? Promise.resolve(null), pdfOps()]);
            // Without a way to place a box on the page, nothing on it can be trusted: it is shown whole.
            if (!convert) return { runs: [], marks: "unknown", aspect: viewport.height / Math.max(1, viewport.width) };
            return measurePage(content.items.filter(isTextItem), list, cropOpsOf(ops), (rect) => convert(rect), viewport.width, viewport.height);
        },
        async links(index: number, rotation: number): Promise<SourcePageLink[]> {
            try {
                const p = await page(index);
                const annotations = (await p.getAnnotations?.({ intent: "display" })) ?? [];
                const viewport = p.getViewport({ scale: 1, rotation: turn(p, rotation) });
                const out: SourcePageLink[] = [];
                for (const a of annotations) {
                    if (a.subtype !== "Link" || !Array.isArray(a.rect) || !viewport.convertToViewportRectangle) continue;
                    const url = a.url ?? a.unsafeUrl;
                    if (!url && (a.dest === undefined || a.dest === null)) continue;
                    const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(a.rect);
                    const w = Math.max(1, viewport.width);
                    const h = Math.max(1, viewport.height);
                    const rect = { x: Math.min(x1, x2) / w, y: Math.min(y1, y2) / h, w: Math.abs(x2 - x1) / w, h: Math.abs(y2 - y1) / h };
                    out.push(url ? { rect, url } : { rect, dest: a.dest });
                }
                return out;
            } catch (error) {
                log.debug(`[Library] no links on page ${index + 1}: ${String(error)}`);
                return [];
            }
        },
        async words(index: number, rotation: number): Promise<PageText> {
            try {
                const p = await page(index);
                const content = await p.getTextContent();
                const viewport = p.getViewport({ scale: 1, rotation: turn(p, rotation) });
                if (!viewport.convertToViewportRectangle) return { text: "", words: [], headings: [] };
                const toViewport = (rect: number[]) => viewport.convertToViewportRectangle!(rect);
                return pageWordsOf(content.items.filter(isTextItem), { width: viewport.width, height: viewport.height, toViewport });
            } catch (error) {
                log.debug(`[Library] no words on page ${index + 1}: ${String(error)}`);
                return { text: "", words: [], headings: [] };
            }
        },
        async destination(dest: unknown, rotation?: (page: number) => number) {
            const found = await resolveDest(dest, doc);
            if (!found || found.page >= doc.numPages) return null;
            if (found.top === undefined) return { page: found.page };
            try {
                const p = await page(found.page);
                const upright = p.getViewport({ scale: 1, rotation: 0 });
                const share = shareDown(found.top, upright, turn(p, rotation?.(found.page) ?? 0));
                return share === undefined ? { page: found.page } : { page: found.page, share };
            } catch {
                return { page: found.page };
            }
        },
    };
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
    // A paper's own page labels (#753 FR-7, #767): *p. iv* where it says iv.
    const labels = await labelsOf(doc);
    const chapters = Array.from({ length: doc.numPages }, (_, i) => {
        const section = sectionOf(toc, i);
        return { label: t("reader_source_page", labels?.[i] ?? String(i + 1)), ...(section ? { section } : {}) };
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

    const firstBox = doc.numPages > 0 ? (await doc.getPage(1)).getViewport({ scale: 1 }) : { width: 612, height: 792 };
    const pages = pagesOf(doc, { width: firstBox.width, height: firstBox.height }, labels);

    return {
        format: "pdf",
        pages,
        path: file.path,
        title: declared(info.Title) ?? titleFromName(file.name),
        ...(declared(info.Author) ? { author: declared(info.Author) } : {}),
        // pdf.js reads the catalog's `/Lang` into the document info as `Language` (#757).
        ...(languageTag(info.Language) ? { language: languageTag(info.Language) } : {}),
        chapters,
        toc,
        imageOnly,
        hasPageView: !imageOnly,
        async draw(index: number, body: HTMLElement, component: Component, view: SourceView): Promise<DrawnChapter> {
            if (view === "page" || imageOnly) {
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
