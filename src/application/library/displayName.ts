import { normalizeLibrary } from "./sourceMeta";

/**
 * What a row calls a note or a source: a book or a paper by the title the Library read from it, and
 * anything else by its file name without folders or extension. Think and Home showed a source's raw
 * file name — `dokumen_pub_…_2nbsped.epub` — and, unbroken, it ran out of its card.
 */
export function displayName(path: string, library: unknown): string {
    const title = normalizeLibrary(library)[path]?.title?.trim();
    if (title) return title;
    return (path.split("/").pop() ?? path).replace(/\.(md|epub|pdf)$/i, "");
}
