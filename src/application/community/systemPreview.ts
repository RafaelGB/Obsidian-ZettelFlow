/**
 * How to type a fetched gallery image (#651) — pure.
 *
 * The in-app system preview is gone (#799): the Systems room draws a system from its own canvas.
 * The `.svg` / `.png` previews stay on GitHub for older releases, and Learn's illustrations (S4) are
 * fetched the same way, so the one rule that matters is kept here.
 *
 * GitHub raw serves `.svg` as `text/plain`, and an `<img>` of a `text/plain` blob shows nothing, so an
 * SVG is always typed as one.
 */
export function previewBlobType(url: string, contentType: string | undefined): string {
    if (/\.svg$/i.test(url)) return "image/svg+xml";
    return contentType ?? "application/octet-stream";
}
