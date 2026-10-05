/**
 * How the Reader sets its type (#668) — pure, so the classes it produces are testable.
 *
 * Every look is the user's theme: *light* and *dark* apply Obsidian's own `theme-light` /
 * `theme-dark` palettes to the reading column only, *sepia* tints the light palette with the
 * theme's own yellow, and *your theme* changes nothing. No colour is invented here (§XV).
 */
export type ReaderFont = "sans" | "serif";
export type ReaderSize = "small" | "medium" | "large";
export type ReaderTheme = "auto" | "light" | "sepia" | "dark";

export interface ReaderPrefs {
    font: ReaderFont;
    size: ReaderSize;
    theme: ReaderTheme;
}

export const READER_FONTS: readonly ReaderFont[] = ["sans", "serif"];
export const READER_SIZES: readonly ReaderSize[] = ["small", "medium", "large"];
export const READER_THEMES: readonly ReaderTheme[] = ["auto", "light", "sepia", "dark"];

export const DEFAULT_READER_PREFS: ReaderPrefs = { font: "sans", size: "medium", theme: "auto" };

/** Whatever was stored, as prefs the reader can use. Unknown values fall back to the default. */
export function normalizeReaderPrefs(raw: unknown): ReaderPrefs {
    const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const pick = <T extends string>(options: readonly T[], v: unknown, fallback: T): T =>
        options.includes(v as T) ? (v as T) : fallback;
    return {
        font: pick(READER_FONTS, value.font, DEFAULT_READER_PREFS.font),
        size: pick(READER_SIZES, value.size, DEFAULT_READER_PREFS.size),
        theme: pick(READER_THEMES, value.theme, DEFAULT_READER_PREFS.theme),
    };
}

/**
 * The classes the reading surface wears. Plugin classes are prefixed by the caller; the two
 * theme classes are Obsidian's own and stay bare on purpose, so the user's theme supplies them.
 */
export function readerClassNames(prefs: ReaderPrefs): { plugin: string[]; obsidian: string[] } {
    const plugin = ["reader", `reader--font-${prefs.font}`, `reader--size-${prefs.size}`, `reader--theme-${prefs.theme}`];
    const obsidian = prefs.theme === "dark" ? ["theme-dark"] : prefs.theme === "light" || prefs.theme === "sepia" ? ["theme-light"] : [];
    return { plugin, obsidian };
}
