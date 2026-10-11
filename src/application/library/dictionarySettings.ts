import { validLanguage } from "./stardict/languages";

/**
 * **Look up's and Translate's settings** (#766 FR-2, FR-3, FR-9) — pure, and forgiving: an older
 * `data.json` has none, and a hand-edited one may hold anything. What is missing or unknown is the
 * default; nothing here is ever written back by reading it.
 */
export interface DictionarySettings {
    /** The vault folder StarDict dictionaries are read from — never created, never written. */
    folder: string;
    /** The languages of a dictionary that declares none, by its path without extension. */
    languages: Record<string, { from: string; to?: string }>;
    /** What *Translate* translates into; `""` is Obsidian's language. */
    translateInto: string;
}

/** No ZettelFlow folder has that name (FR-2). */
export const DEFAULT_DICTIONARIES_FOLDER = "Dictionaries";

export function dictionarySettings(raw: unknown): DictionarySettings {
    const value = raw && typeof raw === "object" ? (raw as Partial<Record<keyof DictionarySettings, unknown>>) : {};
    // An empty folder would be the whole vault: it is the default instead (the review of #766).
    const folder = (typeof value.folder === "string" ? value.folder.trim().replace(/^\/+|\/+$/g, "") : "") || DEFAULT_DICTIONARIES_FOLDER;
    const languages: DictionarySettings["languages"] = {};
    if (value.languages && typeof value.languages === "object") {
        for (const [key, entry] of Object.entries(value.languages as Record<string, unknown>)) {
            const from = (entry as { from?: unknown } | null)?.from;
            const to = (entry as { to?: unknown } | null)?.to;
            if (typeof from !== "string" || !validLanguage(from)) continue;
            languages[key] = { from, ...(typeof to === "string" && validLanguage(to) ? { to } : {}) };
        }
    }
    const into = typeof value.translateInto === "string" && (value.translateInto === "" || validLanguage(value.translateInto)) ? value.translateInto : "";
    return { folder, languages, translateInto: into };
}

/** The languages *Translate into* offers besides Obsidian's own: common ones, named by the platform. */
export const TRANSLATE_LANGUAGES: readonly string[] = ["en", "es", "fr", "de", "it", "pt", "nl", "pl", "ru", "uk", "zh", "ja", "ko", "ar", "hi", "tr"];

/** The choices for *Translate into*: Obsidian's language first, then the common ones — each once. */
export function translateChoices(uiLanguage: string, extra: readonly string[] = []): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const tag of [uiLanguage, ...extra, ...TRANSLATE_LANGUAGES]) {
        const key = (tag || "").toLowerCase();
        if (!key || !validLanguage(tag) || seen.has(key)) continue;
        seen.add(key);
        out.push(tag);
    }
    return out;
}
