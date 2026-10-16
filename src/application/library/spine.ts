import type { ShelfItem } from "./shelf";

/**
 * **A book turned spine-out** (#820): how thick it is and how tall — pure, so the same book stands
 * the same way on every redraw.
 *
 * The thickness is read from the length the shelf already knows — a PDF's pages, an EPUB's spine
 * items, an article's sections, a path's notes — never the file's size, on a log scale and clamped:
 * a 400-page book is thicker than a 40-page paper, and neither is a plank nor a thread. A book whose
 * length is not read yet is of middling thickness. The height is the book's own, 88 to 100 % of a
 * cover, and never taller — so a shelf of spines is no taller than a shelf of covers.
 */

/** The thinnest and the thickest a spine is drawn, in rem. */
export const SPINE_MIN = 1.375;
export const SPINE_MAX = 3.5;

/** About how many pages a thing of each format is per unit of its length. */
const PAGES_PER: Record<ShelfItem["format"], number> = { pdf: 1, epub: 12, article: 2, path: 4 };
/** The page counts the scale runs between. */
const FEW_PAGES = 8;
const MANY_PAGES = 1200;

/** How thick a spine is, in rem. */
export function spineWidth(item: Pick<ShelfItem, "format" | "chapters">): number {
    if (!item.chapters || item.chapters <= 0) return round((SPINE_MIN + SPINE_MAX) / 2);
    const pages = item.chapters * PAGES_PER[item.format];
    const at = (Math.log(pages) - Math.log(FEW_PAGES)) / (Math.log(MANY_PAGES) - Math.log(FEW_PAGES));
    return round(SPINE_MIN + Math.max(0, Math.min(1, at)) * (SPINE_MAX - SPINE_MIN));
}

/** How tall a spine stands, as a share of a cover's height: 0.88 to 1, the same for the same book. */
export function spineHeight(id: string): number {
    let hash = 0;
    for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
    return 0.88 + (Math.abs(hash) % 13) / 100;
}

const round = (value: number) => Math.round(value * 1000) / 1000;
