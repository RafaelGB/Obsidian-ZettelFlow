import { c } from "architecture";
import { t } from "architecture/lang";
import type { ShelfItem } from "application/library/shelf";
import { spineHeight, spineWidth } from "application/library/spine";

/** How many tints a drawn cover is given — the theme's own named colours (see library.scss). */
export const COVER_TINTS = 8;

/** A tint per title, stable across sessions, so a book keeps its colour until its cover is read. */
export function tintOf(title: string): number {
    let hash = 0;
    for (const ch of title) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
    return Math.abs(hash) % COVER_TINTS;
}

/** The points of a reading path's cover: a little constellation, the same for the same path. */
function constellation(seed: string): [number, number][] {
    let state = 0;
    for (const ch of seed) state = (state * 33 + ch.charCodeAt(0)) >>> 0;
    const next = () => {
        state = (state * 1103515245 + 12345) >>> 0;
        return state / 0xffffffff;
    };
    return Array.from({ length: 7 }, (_, i) => [24 + next() * 152, 40 + i * 24 + next() * 14]);
}

/**
 * A cover drawn before — or instead of — the real one (#680): the title and author set in the
 * theme's own type on a tint, and for a reading path a small constellation of its notes. Real
 * covers are laid over it once read (see `LibraryView`), so a shelf is never a wall of grey boxes.
 *
 * Cloth-bound (#820): a hinge down the left edge, a fine weave and a blind-stamped frame, the title
 * in a serif and the author in italic — said once, on the cover, never again under it.
 */
export function drawCover(parent: HTMLElement, item: ShelfItem, size: "shelf" | "desk" | "detail" = "shelf"): HTMLElement {
    const cover = parent.createDiv({
        cls: [c("shelf-cover"), c(`shelf-cover--${item.format}`), c(`shelf-cover--${size}`), c(`shelf-cover--tint-${tintOf(item.title)}`)],
        // Which book: the closing shot (#734) finds its cover again by this.
        attr: { "aria-hidden": "true", ...(size === "detail" ? {} : { "data-zf-book": item.id }) },
    });
    const drawn = cover.createDiv({ cls: c("shelf-cover-drawn") });
    drawn.createSpan({ cls: c("shelf-cover-frame") });
    if (item.kind === "path") {
        const points = constellation(item.id);
        const svg = drawn.createSvg("svg", { cls: [c("shelf-cover-graph")], attr: { viewBox: "0 0 200 220", "aria-hidden": "true" } });
        svg.createSvg("polyline", {
            cls: [c("shelf-cover-graph-line")],
            attr: { points: points.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).join(" ") },
        });
        points.forEach(([x, y], i) =>
            svg.createSvg("circle", {
                cls: [c("shelf-cover-graph-node")],
                attr: { cx: String(Math.round(x)), cy: String(Math.round(y)), r: i === 0 ? "8" : "5" },
            })
        );
    }
    drawn.createDiv({ cls: c("shelf-cover-title"), text: item.title });
    if (item.author) drawn.createDiv({ cls: c("shelf-cover-author"), text: item.author });
    return cover;
}

/**
 * What a book says of itself on the shelf (#820), with no word under it: a paper's **PDF** tag, the
 * **ribbon** of a book you are reading — longer the further you are, never a number — and the
 * **folded corner** of one you finished. The desk shows its own progress, so its books carry no ribbon.
 */
export function bookMarks(book: HTMLElement, item: ShelfItem, onDesk = false): void {
    if (item.kind === "paper") book.createSpan({ cls: c("shelf-tag-pdf"), text: t("shelf_kind_pdf") });
    if (item.status === "reading" && !onDesk) {
        book.createSpan({ cls: c("shelf-ribbon") }).setCssProps({ "--zf-shelf-progress": String(Math.max(0, Math.min(1, item.progress))) });
    }
    if (item.status === "finished") book.createSpan({ cls: c("shelf-fold") });
}

/**
 * A book turned spine-out (#820): its tint, its title running up the spine, as thick as it is long
 * and of its own height — the same book the same way every time.
 */
export function drawSpine(parent: HTMLElement, item: ShelfItem): HTMLElement {
    const spine = parent.createDiv({
        cls: [c("shelf-spine"), c(`shelf-spine--${item.format}`), c(`shelf-cover--tint-${tintOf(item.title)}`)],
        // The open and closing shots find the book by this, spine or cover (#734).
        attr: { "aria-hidden": "true", "data-zf-book": item.id },
    });
    spine.setCssProps({ "--zf-spine-w": `${spineWidth(item)}rem`, "--zf-spine-h": String(spineHeight(item.id)) });
    spine.createSpan({ cls: c("shelf-spine-title"), text: item.title });
    bookMarks(spine, item);
    return spine;
}

/** Lay a real cover over the drawn one. */
export function showCoverImage(cover: HTMLElement, url: string): void {
    if (cover.querySelector("img")) return;
    cover.createEl("img", { cls: c("shelf-cover-image"), attr: { src: url, alt: "", draggable: "false" } });
    cover.addClass(c("shelf-cover--image"));
}

/** A progress ring: how far through, drawn with the theme's accent (green once finished). */
export function progressRing(parent: HTMLElement, progress: number): SVGElement {
    const r = 8;
    const length = 2 * Math.PI * r;
    const svg = parent.createSvg("svg", {
        cls: [c("shelf-ring"), ...(progress >= 1 ? [c("shelf-ring--done")] : [])],
        attr: { viewBox: "0 0 22 22", "aria-hidden": "true" },
    });
    svg.createSvg("circle", { cls: [c("shelf-ring-track")], attr: { cx: "11", cy: "11", r: String(r) } });
    svg.createSvg("circle", {
        cls: [c("shelf-ring-fill")],
        attr: {
            cx: "11",
            cy: "11",
            r: String(r),
            "stroke-dasharray": `${(length * Math.max(0, Math.min(1, progress))).toFixed(2)} ${length.toFixed(2)}`,
            transform: "rotate(-90 11 11)",
        },
    });
    return svg;
}
