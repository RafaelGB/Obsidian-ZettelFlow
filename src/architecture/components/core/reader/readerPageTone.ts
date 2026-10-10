import { backgroundLuminance, luminanceOfPixels, toneOf, toneOfLayers, type PageTone, type ToneLayer } from "application/reader/ink/inkTone";

/**
 * **What a printed page looks like under its ink** (#745, #771): light or dark, read from the page
 * as it was drawn — so the ink on it takes the palette that reads there.
 *
 * - A PDF page (a canvas pdf.js drew) is sampled: its pixels, scaled down to a few.
 * - A designed page (#771, a shadow root of the book's own elements) is read from what it paints:
 *   each element's background colour, its background picture or its own picture (sampled the same
 *   way), in paint order, looked at over a grid of the page (`toneOfLayers`). A comic's dark title
 *   panel over a light `body` is a dark page; its light panels are a light one.
 *
 * `null` when the page cannot say (no 2D context, nothing readable): the ink keeps the paper's
 * palette, as before.
 */

/** The sample a picture is read at: enough to weigh it, few enough to cost nothing. */
const SAMPLE_PX = 16;

/** A designed page is read through at most this many of its elements: a page, never a document. */
const MAX_LAYERS = 600;

type Drawable = CanvasImageSource & Element;

/** The tone of a page's picture, as drawn: a canvas, or a designed page's elements. */
export async function pageTone(picture: HTMLElement): Promise<PageTone | null> {
    if (tagOf(picture) === "canvas") {
        const lum = sample(picture as unknown as Drawable, picture);
        return lum === null ? null : toneOf(lum);
    }
    const host = picture.querySelector?.<HTMLElement>(".zettelkasten-flow__reader-designed-host") ?? null;
    const root = host?.shadowRoot;
    const view = picture.doc?.defaultView ?? picture.win ?? null;
    if (!host || !root || !view) return null;
    const layers: ToneLayer[] = [];
    const pictures = new Map<string, number | null>();
    for (const el of Array.from(root.querySelectorAll("*")).slice(0, MAX_LAYERS)) {
        const box = el.getBoundingClientRect();
        if (!(box.width > 0 && box.height > 0)) continue;
        const style = view.getComputedStyle(el);
        if (style.visibility === "hidden" || Number(style.opacity) < 0.5) continue;
        let luminance: number | null = null;
        const tag = tagOf(el);
        if (tag === "img" || tag === "image") {
            if (tag === "img") await (el as HTMLImageElement).decode?.().catch(() => undefined);
            luminance = sample(el as unknown as Drawable, picture);
        }
        if (luminance === null) {
            const url = /url\(\s*["']?(blob:[^"')]+)["']?\s*\)/.exec(style.backgroundImage ?? "")?.[1];
            if (url) {
                if (!pictures.has(url)) pictures.set(url, await backgroundPicture(url, picture));
                luminance = pictures.get(url) ?? null;
            }
        }
        luminance ??= backgroundLuminance(style.backgroundColor);
        if (luminance !== null) layers.push({ box, luminance });
    }
    return layers.length > 0 ? toneOfLayers(host.getBoundingClientRect(), layers) : null;
}

function tagOf(el: Element): string {
    return (el.localName || el.tagName || "").toLowerCase();
}

/** A background picture the page's sheet points at (only ever our own `blob:` URLs, #771): read once. */
async function backgroundPicture(url: string, from: HTMLElement): Promise<number | null> {
    const img = from.createEl("img", { attr: { src: url } });
    img.remove();
    try {
        await img.decode();
    } catch {
        return null;
    }
    return sample(img, from);
}

/** The luminance of a few pixels of what is drawn, on a canvas of the page's own document. */
function sample(source: Drawable, from: HTMLElement): number | null {
    try {
        const canvas = from.createEl("canvas", { attr: { width: SAMPLE_PX, height: SAMPLE_PX } });
        canvas.remove();
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return null;
        ctx.drawImage(source, 0, 0, SAMPLE_PX, SAMPLE_PX);
        return luminanceOfPixels(ctx.getImageData(0, 0, SAMPLE_PX, SAMPLE_PX).data);
    } catch {
        // A picture that cannot be drawn or read (not loaded, or tainted): it says nothing.
        return null;
    }
}
