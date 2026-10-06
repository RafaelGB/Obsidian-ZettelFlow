/**
 * **The text of a PDF page** (#680, #681, epic #675) — pure, over the runs pdf.js reads off a page.
 *
 * A scanned PDF is pictures of pages: pdf.js finds no text on them, so there is nothing to select
 * and nothing to highlight. The owner asked that this be said **before** you open it (2026-10-06),
 * so the shelf samples the first pages when it draws the cover and remembers the answer.
 */

/** How many pages are sampled to decide a PDF has no text. */
export const IMAGE_ONLY_SAMPLE = 3;

/**
 * Fewer letters than this across the sampled pages is a scan: a page number or a stray running
 * head is not text you can read, and a real page of prose has hundreds.
 */
export const IMAGE_ONLY_LETTERS = 24;

/** Whether the sampled pages' text says the PDF is made of images. */
export function isImageOnly(pageTexts: readonly string[]): boolean {
    if (pageTexts.length === 0) return false;
    const letters = pageTexts.join("").replace(/[^\p{L}]/gu, "").length;
    return letters < IMAGE_ONLY_LETTERS;
}
