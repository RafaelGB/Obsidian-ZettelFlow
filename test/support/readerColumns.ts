/* eslint-disable @typescript-eslint/no-explicit-any */
import { bodyOf, sanitizeChapter, type SourceNode } from "application/library/epubSanitize";
import { DomNode } from "./dashboardDom";
import { parseXml } from "./miniXml";
import { fakePrism } from "./fakePrism";
import { withTextNodes } from "./domText";
import { colourListings } from "architecture/components/core/reader/readerCode";
import type { FixtureChapter } from "./zipFixture";

/**
 * **A chapter in CSS columns, for jest** (#825).
 *
 * jest has no layout engine, and the Reader's *Page* and *Spread* are one strip of CSS columns the
 * browser breaks. To time the Reader's own work on a real-sized chapter — and to prove a page turn
 * lays nothing out — the strip needs boxes. This lays the chapter's blocks out the way the stylesheet
 * would, **lazily, when a box is read** (as a browser does), from what the Reader wrote:
 *
 * - the type, from the classes its root wears: *Size* sets the font size, *Spacing* the line height,
 *   *Font* the width of a character;
 * - the page, from the custom properties the pager writes (`--zf-page-col`, `--zf-page-gap`,
 *   `--zf-page-h`) — so *Width*, *Margins* and *Layout* arrive through the pager's own geometry;
 * - the strip's place, from `--zf-page-x`, which moves every box and lays out nothing.
 *
 * It **counts its reflows**: a box read after the page's shape changed lays the chapter out again,
 * and a box read after only `--zf-page-x` changed does not — which is the claim B2 makes about a turn.
 *
 * It is a model, not Chromium: the numbers it gives are the Reader's work over a laid-out chapter,
 * never the browser's own column breaking. The real numbers come from the app (#825 T8).
 */

const READER = "zettelkasten-flow__reader";
const STAGE = `${READER}-stage`;
const PAGE = `${READER}-page`;
const BODY = `${READER}-body`;
const RUN = `${READER}-code-run`;

const FONT_PX: Record<string, number> = { small: 16, medium: 19, large: 22 };
const LINE: Record<string, number> = { tight: 1.5, normal: 1.75, airy: 2 };
const CHAR_EM: Record<string, number> = { sans: 0.53, serif: 0.5 };
/** Blocks the stylesheet keeps whole on a page (`break-inside: avoid`). */
const WHOLE = new Set(["figure", "img", "table", "svg", "blockquote"]);

interface Piece {
    column: number;
    top: number;
    height: number;
}

interface Laid {
    key: string;
    columns: number;
    pieces: Map<any, Piece[]>;
}

export interface Columns {
    /** How many times the chapter was laid out. */
    readonly reflows: number;
    /** How many times the strip's width was read — what a pagination reads. */
    readonly widthReads: number;
    /** Put the fake DOM back as it was. */
    uninstall(): void;
}

const prop = (el: any, name: string) => parseFloat(el?.cssProps?.[name] ?? "") || 0;

function closestWith(el: any, prefix: string): string | undefined {
    for (let cur = el; cur; cur = cur.parent) {
        for (const name of cur.classes ?? []) if (name.startsWith(prefix)) return name.slice(prefix.length);
    }
    return undefined;
}

function ancestorWith(el: any, cls: string): any {
    for (let cur = el; cur; cur = cur.parent) if (cur.classes?.has(cls)) return cur;
    return null;
}

/** The type the element reads in, from the classes around it — the stylesheet's defaults otherwise. */
function typeOf(el: any): { fontPx: number; linePx: number; charPx: number } {
    const fontPx = FONT_PX[closestWith(el, `${READER}--size-`) ?? "medium"] ?? 19;
    const linePx = fontPx * (LINE[closestWith(el, `${READER}--spacing-`) ?? "normal"] ?? 1.75);
    const charPx = fontPx * (CHAR_EM[closestWith(el, `${READER}--font-`) ?? "serif"] ?? 0.5);
    return { fontPx, linePx, charPx };
}

/** The chapter's blocks, found the way the pager finds them: the body's children, a lone wrapper looked into. */
function blocksOf(page: any): any[] {
    let parent = page.find((el: any) => el.classes?.has(BODY));
    if (!parent) return [];
    for (let depth = 0; depth < 3 && parent.children.length === 1 && (parent.children[0]?.children.length ?? 0) > 1; depth++) {
        parent = parent.children[0];
    }
    return parent.children;
}

export function installColumns(view: { width: number; height: number }): Columns {
    const proto = DomNode.prototype as any;
    const g = globalThis as any;
    const saved = {
        rect: proto.getBoundingClientRect,
        rects: proto.getClientRects,
        scrollWidth: Object.getOwnPropertyDescriptor(proto, "scrollWidth"),
        style: g.getComputedStyle,
        mutators: {} as Record<string, any>,
    };
    const laid = new WeakMap<any, Laid>();
    const texts = new WeakMap<any, number>();
    let reflows = 0;
    let widthReads = 0;
    // The tree's shape changes (a listing split into runs, merged back): what the layout is keyed on.
    let version = 0;
    const mutators = ["appendChild", "remove", "after", "createEl", "insertBefore", "empty"] as const;
    for (const name of mutators) {
        const original = proto[name];
        saved.mutators[name] = original;
        proto[name] = function (this: any, ...args: any[]) {
            // Only a change inside a page lays the page out again — as a browser's layout is incremental:
            // a sheet built beside the stage, or a node not yet on it, costs the page nothing.
            // (The turn's sheet is a copy of the page — its class too — but it lies beside the stage.)
            if (ancestorWith(this, PAGE) && ancestorWith(this, STAGE)) version++;
            return original.apply(this, args);
        };
    }

    const textLength = (block: any): number => {
        let length = texts.get(block);
        if (length === undefined) {
            length = block.textContent.length;
            texts.set(block, length);
        }
        return length;
    };

    /** A listing's lines in a run, and the run's height: a line each, more where *Wrap* folds them. */
    const codeLineH = (type: ReturnType<typeof typeOf>) => type.linePx * 0.9;
    const lineHeightOf = (line: any, columnPx: number, type: ReturnType<typeof typeOf>, wrap: boolean): number => {
        if (!wrap) return codeLineH(type);
        const perLine = Math.max(1, Math.floor(columnPx / (type.fontPx * 0.6)));
        return Math.max(1, Math.ceil(textLength(line) / perLine)) * codeLineH(type);
    };

    /** The height a block takes in a column `columnPx` wide, in this type. */
    const heightOf = (block: any, columnPx: number, pageH: number, type: ReturnType<typeof typeOf>): number => {
        const tag = block.tag;
        if (tag === "figure" || tag === "img" || tag === "svg") return Math.min(pageH, 18 * type.linePx);
        if (tag === "table") return (block.findAll((el: any) => el.tag === "tr").length || 1) * type.linePx * 1.2;
        if (tag === "pre") return (block.textContent.split("\n").length + 1) * type.linePx * 0.9;
        const perLine = Math.max(1, Math.floor(columnPx / type.charPx));
        const lines = Math.max(1, Math.ceil(textLength(block) / perLine));
        return lines * type.linePx * (/^h[1-6]$/.test(tag) ? 1.3 : 1);
    };

    /** The strip as the stylesheet would lay it out now, laid out again only when its shape changed. */
    const layoutOf = (page: any): Laid | null => {
        const columnPx = prop(page, "--zf-page-col");
        const pageH = prop(page, "--zf-page-h");
        if (!(columnPx > 0) || !(pageH > 0)) return null;
        const blocks = blocksOf(page);
        const type = typeOf(page.find((el: any) => el.classes?.has(BODY)) ?? page);
        const wrap = closestWith(page.find((el: any) => el.classes?.has(BODY)) ?? page, `${READER}--code-`) === "wrap";
        const key = [columnPx, prop(page, "--zf-page-gap"), pageH, type.fontPx, type.linePx, type.charPx, wrap, version, blocks.length, blocks[0] ?? ""].join("|");
        const known = laid.get(page);
        if (known && known.key === key && known.pieces.has(blocks[0])) return known;
        reflows++;
        const pieces = new Map<any, Piece[]>();
        const gap = type.linePx * 0.5;
        let column = 0;
        let y = 0;
        for (const block of blocks) {
            const runs = block.tag === "pre" ? block.findAll((el: any) => el.classes?.has(RUN)) : [];
            if (runs.length > 0) {
                // A listing is laid out by its runs (#824): each one whole — a box that scrolls never splits.
                // Its own first box is where it begins, even when its first run is pushed to the next page.
                const all: Piece[] = [{ column, top: y, height: 0 }];
                for (const run of runs) {
                    const lineHs = run.children.map((line: any) => lineHeightOf(line, columnPx, type, wrap));
                    const height = lineHs.reduce((sum: number, h: number) => sum + h, 0) + (run.attrs?.["data-zf-continues"] ? codeLineH(type) : 0);
                    if (y > 0 && y + height > pageH) {
                        column++;
                        y = 0;
                    }
                    const piece = { column, top: y, height };
                    pieces.set(run, [piece]);
                    all.push(piece);
                    let lineTop = y;
                    run.children.forEach((line: any, i: number) => {
                        pieces.set(line, [{ column, top: lineTop, height: lineHs[i] }]);
                        lineTop += lineHs[i];
                    });
                    y += height;
                    if (y >= pageH - 0.5) {
                        column++;
                        y = 0;
                    }
                }
                pieces.set(block, all);
                y += gap;
                if (y >= pageH) {
                    column++;
                    y = 0;
                }
                continue;
            }
            let rest = heightOf(block, columnPx, pageH, type);
            if (WHOLE.has(block.tag) && y > 0 && y + rest > pageH) {
                column++;
                y = 0;
            }
            const own: Piece[] = [];
            while (rest > 0) {
                const take = Math.min(rest, pageH - y);
                own.push({ column, top: y, height: take });
                rest -= take;
                y += take;
                if (y >= pageH - 0.5) {
                    column++;
                    y = 0;
                }
            }
            pieces.set(block, own);
            y += gap;
            if (y >= pageH) {
                column++;
                y = 0;
            }
        }
        const result = { key, columns: Math.max(1, y === 0 && column > 0 ? column : column + 1), pieces };
        laid.set(page, result);
        return result;
    };

    /** The strip's own box: where its first column starts, moved by `--zf-page-x`. */
    const stripBox = (page: any) => ({ left: prop(page, "--zf-page-gap") + prop(page, "--zf-page-x"), top: 0, width: prop(page, "--zf-page-w"), height: view.height });

    /** The boxes of a block a column break cut — one per column it runs through. */
    const piecesOf = (el: any): { left: number; top: number; width: number; height: number }[] | null => {
        const page = ancestorWith(el, PAGE);
        if (!page) return null;
        const layout = layoutOf(page);
        if (!layout) return null;
        const strip = stripBox(page);
        const columnPx = prop(page, "--zf-page-col");
        const stride = columnPx + prop(page, "--zf-page-gap");
        let block = el;
        while (block && !layout.pieces.has(block)) block = block.parent;
        if (!block) {
            // What holds the blocks — the chapter's body, a wrapper — runs through every column, one box each.
            const first = layout.pieces.keys().next().value;
            if (el === page || !first || !el.contains?.(first)) return null;
            const pageH = prop(page, "--zf-page-h");
            return Array.from({ length: layout.columns }, (_, column) => ({ left: strip.left + column * stride, top: 0, width: columnPx, height: pageH }));
        }
        return (layout.pieces.get(block) ?? []).map((piece) => ({ left: strip.left + piece.column * stride, top: piece.top, width: columnPx, height: piece.height }));
    };

    proto.getBoundingClientRect = function (this: any) {
        if (this.classes?.has(STAGE)) return { left: 0, top: 0, width: view.width, height: view.height };
        if (this.classes?.has(PAGE) && prop(this, "--zf-page-col") > 0) return stripBox(this);
        const pieces = piecesOf(this);
        // The box of something laid out: its first piece with a size (a listing's empty start is its rects' only).
        if (pieces && pieces.length > 0) return pieces.find((piece) => piece.height > 0) ?? pieces[0];
        return saved.rect.call(this);
    };
    proto.getClientRects = function (this: any) {
        return piecesOf(this) ?? [];
    };
    Object.defineProperty(proto, "scrollWidth", {
        configurable: true,
        get(this: any) {
            if (!this.classes?.has(PAGE)) return 0;
            widthReads++;
            const layout = layoutOf(this);
            if (!layout) return 0;
            const stride = prop(this, "--zf-page-col") + prop(this, "--zf-page-gap");
            return prop(this, "--zf-page-col") + stride * (layout.columns - 1);
        },
    });
    g.getComputedStyle = (el: any) => ({ fontSize: `${typeOf(el).fontPx}px`, paddingTop: "0px", paddingBottom: "0px", getPropertyValue: () => "" });

    return {
        get reflows() {
            return reflows;
        },
        get widthReads() {
            return widthReads;
        },
        uninstall() {
            for (const [name, original] of Object.entries(saved.mutators)) proto[name] = original;
            proto.getBoundingClientRect = saved.rect;
            if (saved.rects) proto.getClientRects = saved.rects;
            else delete proto.getClientRects;
            if (saved.scrollWidth) Object.defineProperty(proto, "scrollWidth", saved.scrollWidth);
            else delete proto.scrollWidth;
            if (saved.style) g.getComputedStyle = saved.style;
            else delete g.getComputedStyle;
        },
    };
}

/** A stage, a strip and a chapter body wearing the Reader's type classes — the pager's own DOM. */
export function columnStage(type: { size?: string; spacing?: string; font?: string } = {}) {
    const stage = new DomNode("div") as any;
    stage.addClass(STAGE, `${READER}--size-${type.size ?? "medium"}`, `${READER}--font-${type.font ?? "serif"}`);
    if (type.spacing) stage.addClass(`${READER}--spacing-${type.spacing}`);
    const page = stage.createEl("article", { cls: PAGE }) as any;
    const body = page.createDiv({ cls: BODY }) as any;
    return { stage, page, body };
}

/** A generated chapter drawn into `body` the way the Reader rebuilds one: through the book sanitiser. */
export function drawChapter(body: any, chapter: FixtureChapter): void {
    const xhtml = `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body>${chapter.body}</body></html>`;
    const root = bodyOf((parseXml(xhtml) as any).documentElement as SourceNode);
    sanitizeChapter(root, body, {
        element: (parent: any, tag: string, attrs: Record<string, string>) => parent.createEl(tag, { attr: attrs }),
        text: (parent: any, text: string) => parent.appendText(text),
    }, `OEBPS/${chapter.href}`);
    // Its listings coloured and cut into lines, as the app does before a chapter is shown (#824) —
    // read through text nodes, as the DOM has them.
    const undo = withTextNodes();
    try {
        colourListings(body, fakePrism);
    } finally {
        undo();
    }
}

/** Change the type the stage wears, the way `applyPrefs` swaps the root's classes. */
export function wearType(stage: any, kind: "size" | "spacing" | "font", value: string): void {
    for (const name of [...stage.classes]) if (name.startsWith(`${READER}--${kind}-`)) stage.removeClass(name);
    stage.addClass(`${READER}--${kind}-${value}`);
}
