import type { App, Component, TFile } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { IMAGE_ONLY_SAMPLE, furnitureOf, isImageOnly, isTypewritten, reflowPage, runOf, suggestPdfView, type PageBlock, type ReflowOptions, type TextRun } from "application/library/pdfText";
import { linkBlocks, pageWordsOf, type PageText } from "application/library/pdfWords";
import { titleFromName } from "application/library/shelf";
import { languageTag, type KnownPdf } from "application/library/sourceMeta";
import { cropOpsOf, measurePage, type CropBox, type CropOps, type PageInk } from "application/library/pdfCrop";
import { isDesigned, leftOutOf, printOf, type PagePrint } from "application/library/pdfPrint";
import { declared, isTextItem, openPdf, pdfOps, type PdfDocument, type PdfOutlineNode, type PdfPage, type PdfTextItem } from "./pdfjs";
import type { DrawnChapter, SourceDocument, SourcePageLink, SourcePages, SourcePageTask, SourceView, SourceTocEntry } from "./sourceDocument";
import { resolveDest, shareDown } from "./pdfPageView";
import { drawBlocks, plainBlocks } from "./pdfDraw";
import { faceReader } from "./pdfFonts";
import { colourListings } from "architecture/components/core/reader/readerCode";

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

/** A page's operator list, or `null` where pdf.js cannot give one. pdf.js keeps it with the page. */
function listOf(page: PdfPage): Promise<{ fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> } | null> {
    return page.getOperatorList?.().catch((error: unknown) => {
        log.debug(`[Library] no operator list for a page: ${String(error)}`);
        return null;
    }) ?? Promise.resolve(null);
}

/**
 * How long opening waits for the sampled pages' print, all of them (#852): a page of photographs
 * decodes them to give its operators, and a first open is not held for that — past it, a page says nothing.
 */
const PRINT_WAIT_MS = 400;

/** `promise`, or `null` once `ms` have gone by without it. */
function within<T>(promise: Promise<T | null>, ms: number): Promise<T | null> {
    return new Promise((resolve) => {
        const timer = window.setTimeout(() => resolve(null), ms);
        const done = (value: T | null) => {
            window.clearTimeout(timer);
            resolve(value);
        };
        void promise.then(done, () => done(null));
    });
}

/** What a page prints besides its text (#852), from its operator list: `null` when it cannot be told. */
async function pagePrint(page: PdfPage, list: Promise<{ fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> } | null>, ops: CropOps | null): Promise<PagePrint | null> {
    const viewport = page.getViewport({ scale: 1, rotation: (((page.rotate ?? 0) % 360) + 360) % 360 });
    const convert = viewport.convertToViewportRectangle?.bind(viewport);
    if (!convert || !ops) return null;
    return printOf(await list, ops, (rect) => convert(rect), viewport.width, viewport.height);
}

/** Where a page's runs sit (#853): its box in their own space. */
function boxOf(page: PdfPage): { left: number; bottom: number; width: number; height: number } {
    const v = page.view;
    if (v && v.length === 4) return { left: Math.min(v[0], v[2]), bottom: Math.min(v[1], v[3]), width: Math.abs(v[2] - v[0]), height: Math.abs(v[3] - v[1]) };
    const viewport = page.getViewport({ scale: 1, rotation: 0 });
    return { left: 0, bottom: 0, width: viewport.width, height: viewport.height };
}

/**
 * The page as its islands are read (#854): where it sits and what it prints. A page turned by its own
 * `/Rotate` has none — its print is read on the turned page, its text in its own space.
 */
function islandPage(page: PdfPage, print: PagePrint | null): Pick<ReflowOptions, "page"> {
    if (!print || (((page.rotate ?? 0) % 360) + 360) % 360 !== 0) return {};
    return { page: { ...boxOf(page), print } };
}

/** How many islands' pictures a document keeps for a turn back (#854 AC-5): a few, each a table's or a figure's pixels. */
const ISLAND_CACHE = 4;
/** The widest an island's picture is drawn, in device pixels… */
const ISLAND_MAX_PX = 1600;
/** …and the most pixels it holds in all: a tall figure is never past what an iPad can draw (16.7 Mpx), nor near it. */
const ISLAND_MAX_AREA = 2_400_000;
/** A page's decoded pictures are let go once the reading is this many pages away (pdf.js keeps them until `cleanup`). */
const PAGES_HELD = 2;

/** Let a canvas's pixels go: WebKit counts them until it is made 0 × 0. */
function releaseCanvas(canvas: HTMLCanvasElement): void {
    canvas.width = 0;
    canvas.height = 0;
}

/** The box an island element holds, from its `data-zf-island`. */
function islandBox(el: HTMLElement): CropBox | null {
    const parts = (el.getAttribute("data-zf-island") ?? "").split(",").map(Number);
    return parts.length === 4 && parts.every(Number.isFinite) ? { x: parts[0], y: parts[1], w: parts[2], h: parts[3] } : null;
}

/** The document's furniture as a page's reflow takes it (#853): nothing when it has none. */
function furnitureFor(page: PdfPage, keys: ReadonlySet<string>): Pick<ReflowOptions, "furniture"> {
    const { bottom, height } = boxOf(page);
    return keys.size > 0 ? { furniture: { keys, bottom, height } } : {};
}

/** The pages read beside the first ones to find its furniture (#853): a quarter, half and three quarters in. */
function furnitureSample(count: number): number[] {
    const more = [0.25, 0.5, 0.75].map((share) => Math.floor(count * share) + 1);
    return [...new Set(more)].filter((n) => n > IMAGE_ONLY_SAMPLE && n <= count);
}

/** A cancelled drawing is not a failure: a page that left the screen was let go on purpose. */
function quietCancel(error: unknown): void {
    if (!/cancel/i.test(String(error))) throw error;
}

/**
 * The printed pages of a PDF (#767): sizes read as they are asked for, its own labels, drawings that
 * can be let go, and its links — where they sit and where they go. pdf.js stays behind this seam.
 */
function pagesOf(doc: PdfDocument, first: { width: number; height: number }, labels: string[] | null, typewritten = false, furniture: ReadonlySet<string> = new Set()): SourcePages {
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
                // The same faces the Reading view drew the page with (#837): its text, character for character.
                // Never its islands (#854): Page view asks pdf.js for no more than it draws — a page of
                // photographs would decode them twice (#851) — and its words are the same with them or
                // without; only their order on an island's page is the reading view's own.
                return pageWordsOf(content.items.filter(isTextItem), { width: viewport.width, height: viewport.height, toViewport }, { styles: content.styles ?? {}, typewritten, ...furnitureFor(p, furniture) });
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
export async function openPdfSource(app: App, file: TFile, known?: KnownPdf): Promise<SourceDocument> {
    const doc = await openPdf(app, file);
    const info: Record<string, unknown> = (await doc.getMetadata().catch(() => ({ info: {} }))).info ?? {};
    const toc = await outlineOf(doc);
    // A paper's own page labels (#753 FR-7, #767): *p. iv* where it says iv.
    const labels = await labelsOf(doc);
    const chapters = Array.from({ length: doc.numPages }, (_, i) => {
        const section = sectionOf(toc, i);
        // Its identity is its index (#751 P1); its print page, the paper's own label or its number.
        return { label: t("reader_source_page", labels?.[i] ?? String(i + 1)), key: `page:${i}`, page: labels?.[i] ?? String(i + 1), ...(section ? { section } : {}) };
    });
    // The first pages, read once (#813 FR-21): whether it is a scan, and the view it reads best in —
    // and once only (#851 FR-2): a copy the Library has read already is not read again.
    const remembered = known?.typewritten !== undefined && known.furniture !== undefined;
    const samples: string[] = [];
    const shapes: PageBlock[][] = [];
    const sampled: TextRun[][] = [];
    const prints: (PagePrint | null)[] = [];
    // The pages its furniture is learned from (#853 FR-4): these, and a few further in.
    const furnished: { runs: TextRun[]; bottom: number; height: number }[] = [];
    // The operators of the loaded pdf.js: what a page prints is read with them (#852).
    const ops = cropOpsOf(await pdfOps());
    const printsBy = Date.now() + PRINT_WAIT_MS;
    for (let n = 1; !remembered && n <= Math.min(IMAGE_ONLY_SAMPLE, doc.numPages); n++) {
        const page = await doc.getPage(n);
        const content = await page.getTextContent();
        // Then what it prints: a logo on page after page is a designed document (#852 FR-1). A page
        // with no text is a picture — a scan's — and its operators are never asked for.
        if (known?.imageOnly !== true && content.items.some((item) => isTextItem(item) && item.str.trim())) prints.push(await within(pagePrint(page, listOf(page), ops), Math.max(0, printsBy - Date.now())));
        const items = content.items.filter(isTextItem);
        samples.push(items.map((item) => item.str).join(""));
        // The view it suggests is read off the page as it always was (#837 FR-11): formats never move it.
        shapes.push(reflowPage(items.map((item) => runOf(item)), { plain: true }));
        sampled.push(items.map((item) => runOf(item, content.styles ?? {})));
        furnished.push({ runs: items.map((item) => runOf(item)), ...boxOf(page) });
    }
    // A cover seldom has the running head: three pages further in say what comes back page after page.
    for (const n of remembered || isImageOnly(samples) ? [] : furnitureSample(doc.numPages)) {
        const page = await doc.getPage(n);
        const items = (await page.getTextContent()).items.filter(isTextItem);
        furnished.push({ runs: items.map((item) => runOf(item)), ...boxOf(page) });
    }
    // A typewritten paper reads as prose (#837 FR-6): its body face decides, not one page of code.
    const typewritten = known?.typewritten ?? isTypewritten(sampled);
    // Bold and italic, from each font's real name, read once per font (#839).
    const fonts = faceReader(file.path);
    // The shelf may have sampled it already: a scan is known before its first page is drawn.
    const imageOnly = known?.imageOnly ?? isImageOnly(samples);
    const suggestedView = imageOnly ? undefined : remembered ? known.suggestedView : isDesigned(prints) ? "page" : suggestPdfView(shapes);
    // Its running heads and footers, left out of the text in both views (#853).
    const furniture = remembered ? (known.furniture ?? []) : imageOnly ? [] : furnitureOf(furnished);
    const furnitureKeys = new Set(furniture);

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
    const pages = pagesOf(doc, { width: firstBox.width, height: firstBox.height }, labels, typewritten, furnitureKeys);

    // This document's islands' pictures (#854 AC-5), kept for a turn back — the canvas itself, moved
    // back in; one still on screen elsewhere (a second leaf on the paper) is drawn afresh, never stolen.
    const islandPictures = new Map<string, HTMLCanvasElement>();
    const keepIsland = (key: string, canvas: HTMLCanvasElement) => {
        islandPictures.delete(key);
        islandPictures.set(key, canvas);
        while (islandPictures.size > ISLAND_CACHE) {
            const oldest = islandPictures.keys().next().value as string;
            const gone = islandPictures.get(oldest);
            islandPictures.delete(oldest);
            // One still on a page of many islands keeps its pixels; one off the page lets them go.
            if (gone && !gone.isConnected) releaseCanvas(gone);
        }
    };
    // The pages the reading view asked pdf.js about: their decoded pictures are let go once you are past them.
    const touched = new Set<number>();
    const letGo = (reading: number) => {
        for (const index of [...touched]) {
            if (Math.abs(index - reading) <= PAGES_HELD) continue;
            touched.delete(index);
            void doc.getPage(index + 1).then((page) => page.cleanup?.(), () => undefined);
        }
    };

    /**
     * The islands of a drawn page, shown as printed (#854 FR-3, AC-5): each drawn once it nears the
     * screen, as Page view draws a page — its crop, at the reading's width, never past `ISLAND_MAX_PX` —
     * and drawn again from what was kept when the page comes back. It fades in as a page does.
     */
    const showIslands = (index: number, body: HTMLElement, component: Component): void => {
        const figures = Array.from(body.querySelectorAll<HTMLElement>("[data-zf-island]"));
        if (figures.length === 0) return;
        // The page left (a turn, the view closed): a drawing still going is let go, and never kept.
        let gone = false;
        component.register(() => {
            gone = true;
        });
        const draw = (figure: HTMLElement) => {
            const box = islandBox(figure);
            if (!box || gone || figure.querySelector("canvas")) return;
            const ratio = (body.ownerDocument?.defaultView?.devicePixelRatio ?? 1) || 1;
            const width = Math.min(ISLAND_MAX_PX, Math.round((figure.clientWidth || PAGE_WIDTH) * ratio));
            const key = `${index}|${figure.getAttribute("data-zf-island")}|${width}`;
            const kept = islandPictures.get(key);
            if (kept && kept.width > 1 && !kept.isConnected) {
                figure.appendChild(kept);
                figure.addClass(c("reader-pdf-island--drawn"));
                return;
            }
            const canvas = figure.createEl("canvas", { cls: c("reader-pdf-island-picture"), attr: { "aria-hidden": "true" } });
            const render = pages.render?.bind(pages);
            if (!render) return;
            void pages
                .size(index)
                .then((size) => {
                    if (gone) return;
                    const points = { w: box.w * size.width, h: box.h * size.height };
                    // As wide as the reading, and never more pixels than ISLAND_MAX_AREA in all.
                    const scale = Math.min(width / Math.max(1, points.w), Math.sqrt(ISLAND_MAX_AREA / Math.max(1, points.w * points.h)));
                    const task = render(index, canvas, { scale, rotation: 0, frame: box });
                    component.register(() => task.cancel());
                    return task.promise.then(() => {
                        // A drawing let go resolves too (a turn cancels it): only a finished one is shown and kept.
                        if (gone) {
                            releaseCanvas(canvas);
                            return;
                        }
                        figure.addClass(c("reader-pdf-island--drawn"));
                        keepIsland(key, canvas);
                    });
                })
                .catch((error: unknown) => log.debug(`[Library] an island of page ${index + 1} was not drawn: ${String(error)}`));
        };
        const Observer = body.ownerDocument?.defaultView?.IntersectionObserver ?? (typeof window === "undefined" ? undefined : window.IntersectionObserver);
        if (!Observer) {
            figures.forEach(draw);
            return;
        }
        // Near the screen: a screen ahead, either way the reading goes — measured against the stage the
        // reading is clipped by, so in Page and Spread the next column counts, not only the one on show.
        const stage = body.closest?.(`.${c("reader-stage")}`) ?? null;
        const near = new Observer(
            (entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    near.unobserve(entry.target);
                    draw(entry.target as HTMLElement);
                }
            },
            { ...(stage ? { root: stage } : {}), rootMargin: "100%" }
        );
        figures.forEach((figure) => near.observe(figure));
        component.register(() => near.disconnect());
    };

    const linked = async (page: PdfPage, index: number, items: PdfTextItem[], blocks: PageBlock[]): Promise<PageBlock[]> => {
        const links = await pages.links(index, 0);
        if (links.length === 0) return blocks;
        const viewport = page.getViewport({ scale: 1, rotation: (((page.rotate ?? 0) % 360) + 360) % 360 });
        if (!viewport.convertToViewportRectangle) return blocks;
        const toViewport = (rect: number[]) => viewport.convertToViewportRectangle!(rect);
        const words = pageWordsOf(items, { width: viewport.width, height: viewport.height, toViewport }, { blocks });
        return linkBlocks(blocks, words, links);
    };

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
        typewritten,
        furniture,
        ...(suggestedView ? { suggestedView } : {}),
        async draw(index: number, body: HTMLElement, component: Component, view: SourceView): Promise<DrawnChapter> {
            if (view === "page" || imageOnly) {
                await drawPicture(index, body, component);
                return { words: 0, picture: true };
            }
            const page = await doc.getPage(index + 1);
            // The first page reads its fonts beside its text; a later one only for a font not seen yet.
            const early = fonts.early(page);
            // What it prints besides its text, to say what the reading view leaves out (#852 FR-2).
            const list = listOf(page);
            touched.add(index);
            letGo(index);
            // And the next page's, read now so a turn does not wait for it: pdf.js keeps it with the page.
            if (index + 1 < doc.numPages) {
                touched.add(index + 1);
                void doc.getPage(index + 2).then(listOf, () => null);
            }
            const content = await page.getTextContent();
            const styles = content.styles ?? {};
            const items = content.items.filter(isTextItem);
            // The fonts are read off the very list the page was asked for: pdf.js keeps one per page.
            const faces = await fonts.read(page, items, early ?? list);
            // What it prints besides its text: its islands are shown as printed (#854), the rest is said (#852).
            const print = await pagePrint(page, list, ops);
            const reflowed = reflowPage(items.map((item) => runOf(item, styles, faces)), { typewritten, ...furnitureFor(page, furnitureKeys), ...islandPage(page, print) });
            // Its links, over the very words Page view links (#841); a page with none does no more.
            const blocks = await linked(page, index, items, reflowed);
            const text = blocks.map((block) => block.text).join(" ");
            if (text.replace(/[^\p{L}]/gu, "").length < PICTURE_LETTERS) {
                // A page that is a figure: its picture is what there is to read.
                await drawPicture(index, body, component);
                return { words: 0, picture: true };
            }
            const shown = blocks.filter((block) => block.kind === "island" && block.box).map((block) => ({ box: block.box!, ...(block.island ? { island: block.island } : {}) }));
            const leftOut = leftOutOf(print, shown);
            const said = leftOut ? { leftOut } : {};
            if (plainBlocks(blocks)) {
                drawBlocks(body, blocks);
                return { words: text.split(/\s+/).filter(Boolean).length, picture: false, ...said };
            }
            // A page with formats is built aside and put on the page whole (#837 AC-M1): a listing is
            // never seen as a run-on paragraph first.
            const into = detached(body);
            drawBlocks(into, blocks);
            const listings = into.querySelector("pre") ? colourListings(into, null) : 0;
            // Only elements stand at the top of a drawn page: its blocks, moved whole.
            for (const child of Array.from(into.children)) body.appendChild(child);
            showIslands(index, body, component);
            return { words: text.split(/\s+/).filter(Boolean).length, picture: false, ...said, ...(listings > 0 ? { listings } : {}) };
        },
        resolveLink(fromChapter: number, href: string) {
            // A footnote's marker, to its note on the same page (#840 FR-7): the only link the reading
            // view draws that the Reader follows itself.
            return href.startsWith("#zf-pdf-note-") ? { chapter: fromChapter, fragment: href.slice(1) } : null;
        },
        close(): void {
            for (const canvas of islandPictures.values()) releaseCanvas(canvas);
            islandPictures.clear();
            void doc.destroy().catch(() => undefined);
        },
    };
}

/** An element in the page's own document, off the page: where a page with formats is built first. */
function detached(body: HTMLElement): HTMLElement {
    const holder = body.createDiv();
    holder.remove();
    return holder;
}
