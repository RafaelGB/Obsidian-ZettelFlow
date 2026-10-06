/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * A pdf.js stand-in (#680, #681): what `loadPdfJs()` resolves to in the app — `getDocument` →
 * pages with text runs, metadata, an outline — shaped as pdf.js 5.3 answers, so the Library and the
 * Reader can be tested on a paper without a real PDF.
 */
export interface FakeRun {
    str: string;
    x: number;
    y: number;
    size?: number;
    width?: number;
    hasEOL?: boolean;
}

export interface FakePage {
    runs: FakeRun[];
    width?: number;
    height?: number;
}

export interface FakePdf {
    pages: FakePage[];
    info?: Record<string, unknown>;
    outline?: { title: string; dest: unknown; items: any[] }[] | null;
    /** Named destinations → a page reference. */
    destinations?: Record<string, unknown[]>;
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
    const calls = { getDocument: [] as any[], rendered: [] as number[], destroyed: 0 };
    const page = (n: number) => {
        const spec = pdf.pages[n - 1];
        return {
            pageNumber: n,
            getViewport: ({ scale }: { scale: number }) => ({ width: (spec.width ?? 612) * scale, height: (spec.height ?? 792) * scale, scale }),
            getTextContent: async () => ({
                items: spec.runs.map((r) => ({
                    str: r.str,
                    transform: [r.size ?? 10, 0, 0, r.size ?? 10, r.x, r.y],
                    width: r.width ?? r.str.length * (r.size ?? 10) * 0.5,
                    height: r.size ?? 10,
                    hasEOL: r.hasEOL ?? false,
                })),
            }),
            render: () => {
                calls.rendered.push(n);
                return { promise: Promise.resolve(), cancel: () => undefined };
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
        destroy: async () => {
            calls.destroyed++;
        },
    };
    const lib = {
        getDocument: (source: any) => {
            calls.getDocument.push(source);
            return { promise: Promise.resolve(doc) };
        },
    };
    return { lib, doc, calls };
}
