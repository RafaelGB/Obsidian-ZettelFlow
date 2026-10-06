import { c } from "architecture";
import type { ShelfItem } from "application/library/shelf";

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
 */
export function drawCover(parent: HTMLElement, item: ShelfItem, size: "card" | "hero" | "detail" = "card"): HTMLElement {
    const cover = parent.createDiv({
        cls: [c("shelf-cover"), c(`shelf-cover--${item.format}`), c(`shelf-cover--${size}`), c(`shelf-cover--tint-${tintOf(item.title)}`)],
        attr: { "aria-hidden": "true" },
    });
    const drawn = cover.createDiv({ cls: c("shelf-cover-drawn") });
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
