// Pure, Obsidian-free filename / path / mime helpers for the export util (A3, #386). Kept separate so
// it is unit-testable without a DOM or Vault, and reusable by B4 (#387, the Before/After idea card).

/** Map a capture MIME type to a file extension (a codec suffix like `;codecs=vp9` is ignored). */
export function mimeToExtension(mime: string): string {
    const base = (mime || "").split(";")[0].trim().toLowerCase();
    switch (base) {
        case "image/png": return "png";
        case "image/jpeg": return "jpg";
        case "image/webp": return "webp";
        case "video/webm": return "webm";
        case "video/mp4": return "mp4";
        default: return "bin";
    }
}

/** Slugify an arbitrary label into a filename-safe token (lowercase, dashes, no unsafe characters). */
function slug(label: string): string {
    return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function pad(n: number): string {
    return String(n).padStart(2, "0");
}

/**
 * A stable, sortable base name: `zettelflow-<kind>-YYYYMMDD-HHmmss`, plus an optional slugged label.
 * Deterministic for a given `date` (no `Date.now()` inside), so it is unit-testable.
 */
export function buildExportBaseName(kind: string, date: Date, label?: string): string {
    const stamp =
        `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
        `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
    const parts = ["zettelflow", slug(kind), stamp];
    const tail = label ? slug(label) : "";
    if (tail) parts.push(tail);
    return parts.join("-");
}

/**
 * The first non-colliding `folder/base.ext`, appending ` (1)`, ` (2)`, … while `exists(path)` is true.
 * Pure: collision detection is injected, so there is no I/O and it is fully testable.
 */
export function resolveAvailablePath(folder: string, base: string, ext: string, exists: (path: string) => boolean): string {
    const dir = folder ? folder.replace(/\/+$/, "") + "/" : "";
    const first = `${dir}${base}.${ext}`;
    if (!exists(first)) return first;
    for (let i = 1; i < 1000; i++) {
        const candidate = `${dir}${base} (${i}).${ext}`;
        if (!exists(candidate)) return candidate;
    }
    return `${dir}${base}-${Date.now()}.${ext}`;
}
