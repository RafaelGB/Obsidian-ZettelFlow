import { LANGUAGE_TAG, type StardictIfo } from "./ifo";

/**
 * **A dictionary's languages** (#766 FR-3, FR-5) — pure. *From* the language its words are in, *to*
 * the language it explains them in: one for a **monolingual** dictionary, two for a **bilingual** one,
 * whose entry is the word's translation. Read from the dictionary's own declaration when it makes
 * one, else from the two fields set once in Settings → Reading (never written into the dictionary).
 */
export interface DictionaryLanguages {
    from: string;
    to?: string;
}

/** A language tag's first subtag, lower case: `es-ES` → `es`. */
export function primaryLanguage(tag: string | null | undefined): string {
    return (tag ?? "").split(/[-_]/)[0].toLowerCase();
}

/** Whether `tag` is one the settings fields can keep. */
export function validLanguage(tag: string): boolean {
    return LANGUAGE_TAG.test(tag);
}

/** The declaration wins; the saved fields fill a dictionary that declares none. `null`: unknown yet. */
export function dictionaryLanguages(ifo: Pick<StardictIfo, "lang"> | null, saved?: { from?: string; to?: string }): DictionaryLanguages | null {
    if (ifo?.lang?.from) return ifo.lang;
    const from = saved?.from?.trim();
    if (!from || !validLanguage(from)) return null;
    const to = saved?.to?.trim();
    return to && validLanguage(to) && primaryLanguage(to) !== primaryLanguage(from) ? { from, to } : { from };
}

/** Whether a dictionary translates (bilingual) rather than explains (monolingual). */
export function isBilingual(languages: DictionaryLanguages): boolean {
    return Boolean(languages.to) && primaryLanguage(languages.to) !== primaryLanguage(languages.from);
}

/** The dictionaries for a book in `bookLanguage`: those whose *from* is its language (AC-4). */
export function dictionariesFor<T extends { languages: DictionaryLanguages | null }>(bookLanguage: string, dictionaries: readonly T[]): T[] {
    const book = primaryLanguage(bookLanguage);
    if (!book) return [];
    return dictionaries.filter((dictionary) => dictionary.languages && primaryLanguage(dictionary.languages.from) === book);
}

/**
 * FR-5's order: monolingual first, then bilingual into Obsidian's language, then any other
 * bilingual — ties by the dictionary's name. Deterministic, whatever order they were found in.
 */
export function orderDictionaries<T extends { name: string; languages: DictionaryLanguages | null }>(dictionaries: readonly T[], uiLanguage: string): T[] {
    const ui = primaryLanguage(uiLanguage);
    const rank = (dictionary: T): number => {
        const languages = dictionary.languages;
        if (!languages || !isBilingual(languages)) return 0;
        return primaryLanguage(languages.to) === ui ? 1 : 2;
    };
    return [...dictionaries].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
