/**
 * The plugin the Reader reads and saves through (#669) — handed over once, at load, by the
 * component that registers the Reader's doors.
 *
 * Several doors open a reading (a note's menu, a folder, Explore, This note), and the chooser they
 * share needs the resume map. Each door is handed this host rather than reaching for the plugin
 * through a global lookup, which is not ready while the plugin loads (#374).
 */
export interface ReaderHost {
    settings?: {
        readerPrefs?: unknown;
        readerResume?: Record<string, { chapter: number; total: number; at: number }>;
        /** Each reading's layers (#758): where new marks go, which are hidden. Read through `normalizeLayerPrefs()`. */
        readerLayers?: unknown;
        readerSaved?: unknown;
        /** What the Library knows about each source, and where you are in it (#680, #681). */
        library?: unknown;
        /** How a book opens and a chapter turns (#732): read through `readingMotion()`. */
        readingMotion?: unknown;
        /** Look up's dictionaries folder and Translate's target (#766): read through `dictionarySettings()`. */
        dictionaries?: unknown;
        /** The citation form chosen last (#768): read through `citeFormOf()`. */
        citeForm?: unknown;
        shareAuthor?: string;
    };
    saveSettings?(): Promise<void>;
}

let host: ReaderHost | null = null;

export function setReaderHost(next: ReaderHost | null): void {
    host = next;
}

export function readerHost(): ReaderHost | null {
    return host;
}
