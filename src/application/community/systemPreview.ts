/**
 * Where a community system's preview image lives, and how to type it (#651) — pure.
 *
 * The previews are SVG drawings of the system's canvas since #651. A sibling PNG, rendered from
 * the same drawing, stays in the catalog for releases that only ever asked for `<id>.png`, so the
 * modal tries the SVG first and the PNG second.
 */
export function systemPreviewUrls(baseUrl: string, ref: string): string[] {
    const stem = `${baseUrl}${ref.replace(/\.zftemplate$/, "")}`;
    return [`${stem}.svg`, `${stem}.png`];
}

/**
 * The blob type to draw a fetched preview with. GitHub raw serves `.svg` as `text/plain`, and an
 * `<img>` of a `text/plain` blob shows nothing, so an SVG is always typed as one.
 */
export function previewBlobType(url: string, contentType: string | undefined): string {
    if (/\.svg$/i.test(url)) return "image/svg+xml";
    return contentType ?? "application/octet-stream";
}
