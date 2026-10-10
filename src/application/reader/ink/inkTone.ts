/**
 * **The tone of a printed page** (#745, #771): whether the ink drawn on it should be the light
 * palette's (dark ink, for a light page) or the dark palette's (light ink, for a dark page).
 *
 * A PDF page is white paper almost always, but a designed book (#771) — a comic, a picture book, a
 * cookbook printed on black — is whatever its maker chose. So the page is read, not assumed: the
 * pixels drawn under the ink, or the designed page's own background. Text ink never asks this: it
 * sits on the reading column, which is the user's theme.
 *
 * Pure: colours in, a tone out.
 */

export type PageTone = "light" | "dark";

/**
 * The relative luminance where black and white ink contrast the same against a page (WCAG 2): on a
 * page darker than this, light ink reads better; on a lighter one, dark ink does.
 */
export const DARK_PAGE_LUMINANCE = 0.179;

/** Below this alpha a background says nothing of the page: what is under it shows through. */
const OPAQUE_ENOUGH = 0.5;

/** One sRGB channel (0–255) as linear light. */
function linear(channel: number): number {
    const c = Math.min(255, Math.max(0, channel)) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** The relative luminance of an sRGB colour (0 black … 1 white), as WCAG 2 defines it. */
export function relativeLuminance(r: number, g: number, b: number): number {
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** The tone of a page of this luminance. */
export function toneOf(luminance: number): PageTone {
    return luminance < DARK_PAGE_LUMINANCE ? "dark" : "light";
}

/**
 * The luminance of a sample of a page's pixels (RGBA, four bytes a pixel, as `getImageData` gives
 * them). A transparent pixel is the paper under it — white — so an unpainted page reads light.
 * `null` when there is no pixel at all.
 */
export function luminanceOfPixels(data: ArrayLike<number>): number | null {
    const pixels = Math.floor(data.length / 4);
    if (pixels === 0) return null;
    let sum = 0;
    for (let i = 0; i < pixels; i++) {
        const a = (data[i * 4 + 3] ?? 255) / 255;
        const lum = relativeLuminance(data[i * 4] ?? 0, data[i * 4 + 1] ?? 0, data[i * 4 + 2] ?? 0);
        sum += a * lum + (1 - a);
    }
    return sum / pixels;
}

/** The tone of a sample of a page's pixels — `null` when there is no pixel at all. */
export function toneOfPixels(data: ArrayLike<number>): PageTone | null {
    const lum = luminanceOfPixels(data);
    return lum === null ? null : toneOf(lum);
}

/** A computed colour (`rgb(r, g, b)`, `rgba(r, g, b, a)`, or the space-separated form), or `null`. */
export function parseComputedColour(css: string): { r: number; g: number; b: number; a: number } | null {
    const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(css.trim());
    if (!m) return null;
    const alpha = m[4] === undefined ? 1 : m[4].endsWith("%") ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: alpha };
}

/** The luminance a computed background paints — `null` when it is (nearly) transparent or unreadable. */
export function backgroundLuminance(css: string): number | null {
    const colour = parseComputedColour(css);
    if (!colour || colour.a < OPAQUE_ENOUGH) return null;
    return relativeLuminance(colour.r, colour.g, colour.b);
}

/** The tone a computed background gives a page — `null` when it is (nearly) transparent or unreadable. */
export function toneOfBackground(css: string): PageTone | null {
    const lum = backgroundLuminance(css);
    return lum === null ? null : toneOf(lum);
}

/** A box on screen. */
export interface ToneBox {
    left: number;
    top: number;
    width: number;
    height: number;
}

/** Something a designed page paints, in paint order: its box and how light it is. */
export interface ToneLayer {
    box: ToneBox;
    luminance: number;
}

/** The points a designed page is looked at: a grid over it, so the whole page is weighed. */
export const TONE_GRID = { cols: 6, rows: 8 } as const;

/**
 * The tone of a designed page from what it paints (#771): at each point of a grid over the page, the
 * last layer that covers it (the one on top, in paint order) — the paper, white, where none does —
 * and the mean of what is seen. A comic's dark title panel over a light body is a dark page.
 */
export function toneOfLayers(page: ToneBox, layers: readonly ToneLayer[], grid: { cols: number; rows: number } = TONE_GRID): PageTone | null {
    if (!(page.width > 0 && page.height > 0)) return null;
    let sum = 0;
    for (let row = 0; row < grid.rows; row++) {
        for (let col = 0; col < grid.cols; col++) {
            const x = page.left + ((col + 0.5) / grid.cols) * page.width;
            const y = page.top + ((row + 0.5) / grid.rows) * page.height;
            let seen = 1;
            for (let i = layers.length - 1; i >= 0; i--) {
                const b = layers[i].box;
                if (x >= b.left && x < b.left + b.width && y >= b.top && y < b.top + b.height) {
                    seen = layers[i].luminance;
                    break;
                }
            }
            sum += seen;
        }
    }
    return toneOf(sum / (grid.cols * grid.rows));
}
