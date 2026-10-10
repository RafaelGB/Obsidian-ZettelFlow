/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * A pdf.js stand-in (#680, #681): what `loadPdfJs()` resolves to in the app — `getDocument` →
 * pages with text runs, metadata, an outline — shaped as pdf.js 5.3 answers, so the Library and the
 * Reader can be tested on a paper without a real PDF.
 */
import { PDFJS_OPS } from "./pdfCropPaper";

export interface FakeRun {
    str: string;
    x: number;
    y: number;
    size?: number;
    width?: number;
    hasEOL?: boolean;
}

/** A link annotation on a fake page (#767): an internal destination, or an address out of the paper. */
export interface FakeLink {
    rect: [number, number, number, number];
    dest?: unknown;
    url?: string;
}

export interface FakePage {
    runs: FakeRun[];
    width?: number;
    height?: number;
    /** The page's own `/Rotate`. */
    rotate?: number;
    links?: FakeLink[];
    /** What the page paints, as pdf.js 5.3's operator list (#769); nothing but its text when absent. */
    ops?: { fnArray: number[]; argsArray: unknown[] };
}

export interface FakePdf {
    pages: FakePage[];
    info?: Record<string, unknown>;
    outline?: { title: string; dest: unknown; items: any[] }[] | null;
    /** Named destinations → a page reference. */
    destinations?: Record<string, unknown[]>;
    /** The PDF's own page labels (`getPageLabels`), or none. */
    labels?: string[] | null;
    /** Hold every drawing until the test lets it go (`calls.release()`), to see what waits and what is cancelled. */
    holdRenders?: boolean;
    /** Hold every operator list until `calls.releaseOps()` — the paper still being measured (#769). */
    holdOps?: boolean;
    /** Every operator list fails: the margins cannot be measured (#769). */
    failOps?: boolean;
    /** The library's `OPS` (#769); pdf.js 5.3's codes when absent. */
    OPS?: Record<string, number> | null;
}

/** One drawing asked of the fake pdf.js: which page, at what scale and turn — and whether it was let go. */
export interface FakeRender {
    page: number;
    scale: number;
    rotation: number;
    /** Where the viewport was moved to: a cropped page is drawn from its frame's corner (#769). */
    offsetX: number;
    offsetY: number;
    cancelled: boolean;
    done: boolean;
}

export function run(str: string, x: number, y: number, size = 10, hasEOL = false): FakeRun {
    return { str, x, y, size, width: str.length * size * 0.5, hasEOL };
}

/** Lines of prose as runs, top to bottom, one run per line. */
export function prose(lines: string[], options: { top?: number; size?: number; gap?: number; x?: number } = {}): FakeRun[] {
    const { top = 700, size = 10, gap = 12, x = 72 } = options;
    return lines.map((line, i) => run(line, x, top - i * gap, size, true));
}

export function makePdfJs(pdf: FakePdf) {
    const held: (() => void)[] = [];
    const heldOps: (() => void)[] = [];
    const calls = {
        /** Operator lists asked for, by page number (#769). */
        opLists: [] as number[],
        releaseOps: () => {
            for (const done of heldOps.splice(0)) done();
        },
        getDocument: [] as any[],
        rendered: [] as number[],
        renders: [] as FakeRender[],
        destroyed: 0,
        /** Let every held drawing finish. */
        release: () => {
            for (const done of held.splice(0)) done();
        },
    };
    const page = (n: number) => {
        const spec = pdf.pages[n - 1];
        const own = spec.rotate ?? 0;
        const viewport = ({ scale, rotation = own, offsetX = 0, offsetY = 0 }: { scale: number; rotation?: number; offsetX?: number; offsetY?: number }) => {
            const w = (spec.width ?? 612) * scale;
            const h = (spec.height ?? 792) * scale;
            const quarter = (((rotation % 360) + 360) % 360) % 180 === 90;
            const width = quarter ? h : w;
            const height = quarter ? w : h;
            return {
                width,
                height,
                scale,
                rotation,
                offsetX,
                offsetY,
                // PDF space (from the bottom-left of the upright page) to this viewport, as pdf.js does.
                convertToViewportRectangle: (rect: number[]) => {
                    const point = (x: number, y: number): [number, number] => {
                        const px = x * scale;
                        const py = h - y * scale;
                        const r = ((rotation % 360) + 360) % 360;
                        if (r === 90) return [h - py, px];
                        if (r === 180) return [w - px, h - py];
                        if (r === 270) return [py, w - px];
                        return [px, py];
                    };
                    const [a, b] = point(rect[0], rect[1]);
                    const [c, d] = point(rect[2], rect[3]);
                    return [a, b, c, d];
                },
            };
        };
        return {
            pageNumber: n,
            rotate: own,
            getViewport: viewport,
            getAnnotations: async () => (spec.links ?? []).map((link) => ({ subtype: "Link", rect: link.rect, ...(link.url ? { url: link.url } : { dest: link.dest }) })),
            getTextContent: async () => ({
                items: spec.runs.map((r) => ({
                    str: r.str,
                    transform: [r.size ?? 10, 0, 0, r.size ?? 10, r.x, r.y],
                    width: r.width ?? r.str.length * (r.size ?? 10) * 0.5,
                    height: r.size ?? 10,
                    hasEOL: r.hasEOL ?? false,
                })),
            }),
            render: (options: any) => {
                calls.rendered.push(n);
                const vp = options?.viewport ?? {};
                const record: FakeRender = { page: n, scale: vp.scale ?? 1, rotation: vp.rotation ?? own, offsetX: vp.offsetX ?? 0, offsetY: vp.offsetY ?? 0, cancelled: false, done: false };
                calls.renders.push(record);
                let finish = () => undefined as void;
                let fail = (_: unknown) => undefined as void;
                const promise = new Promise<void>((resolve, reject) => {
                    finish = () => {
                        record.done = true;
                        resolve();
                    };
                    fail = reject;
                });
                if (pdf.holdRenders) held.push(() => finish());
                else finish();
                return {
                    promise,
                    cancel: () => {
                        if (record.done) return;
                        record.cancelled = true;
                        fail(new Error("Rendering cancelled, page 1"));
                    },
                };
            },
            getOperatorList: () => {
                calls.opLists.push(n);
                const list = spec.ops ?? { fnArray: [], argsArray: [] };
                if (pdf.failOps) return Promise.reject(new Error("operator list failed"));
                if (!pdf.holdOps) return Promise.resolve(list);
                return new Promise((resolve) => heldOps.push(() => resolve(list)));
            },
            cleanup: () => undefined,
        };
    };
    const doc = {
        numPages: pdf.pages.length,
        getPage: async (n: number) => page(n),
        getMetadata: async () => ({ info: pdf.info ?? {} }),
        getOutline: async () => pdf.outline ?? null,
        getDestination: async (name: string) => pdf.destinations?.[name] ?? null,
        getPageIndex: async (ref: any) => ref.num,
        getPageLabels: async () => pdf.labels ?? null,
        destroy: async () => {
            calls.destroyed++;
        },
    };
    const lib = {
        OPS: pdf.OPS === undefined ? PDFJS_OPS : pdf.OPS,
        getDocument: (source: any) => {
            calls.getDocument.push(source);
            return { promise: Promise.resolve(doc) };
        },
    };
    return { lib, doc, calls };
}
