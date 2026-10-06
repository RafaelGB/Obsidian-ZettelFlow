import type { ReaderHost } from "architecture/components/core/reader/readerHost";

/**
 * The plugin the Library reads and saves through (#680): the Reader's own host — the saved
 * readings and their places are the Reader's — plus what the Library remembers about each source.
 * Handed over at load (#374), never looked up through a global while the plugin loads.
 */
export interface LibraryHost extends ReaderHost {
    settings?: ReaderHost["settings"] & {
        library?: unknown;
    };
}

export const LIBRARY_VIEW = "zettelflow-library";

let host: LibraryHost | null = null;

export function setLibraryHost(next: LibraryHost | null): void {
    host = next;
}

export function libraryHost(): LibraryHost | null {
    return host;
}
