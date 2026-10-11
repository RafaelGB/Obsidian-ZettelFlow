import { foldWord } from "./idx";
import { isBilingual, orderDictionaries, type DictionaryLanguages } from "./languages";

/**
 * **Finding the word** (#766 FR-1, FR-5, FR-6) — pure. The selection, trimmed and with its spaces
 * folded, is matched ignoring case against each dictionary's headwords, then against its synonyms.
 * Nothing else: no stemming of our own, no fuzzy match, no accent folding — a miss says so honestly.
 */

/** *Look up* is offered for up to this many words (FR-1). */
export const LOOKUP_MAX_WORDS = 3;
/** Past this, a selection is a passage, not a word. */
const LOOKUP_MAX_CHARS = 80;

/** A dictionary, as the look-up reads it: opened, its table built. */
export interface LookupDictionary {
    name: string;
    languages: DictionaryLanguages | null;
    headwords: ReadonlyMap<string, readonly number[]>;
    synonyms?: { get(key: string): readonly number[] | undefined };
}

export interface LookupHit<T extends LookupDictionary> {
    dictionary: T;
    /** The records of the index the word leads to. */
    records: number[];
    via: "headword" | "synonym";
    /** A bilingual dictionary's entry is the word's translation (FR-5). */
    translation: boolean;
}

type Segmenter = { segment(text: string): Iterable<{ isWordLike?: boolean }> };

/** How many words a selection holds — by the platform's word segmenter where there is one (CJK). */
export function wordCount(text: string, language?: string): number {
    const flat = text.trim();
    if (!flat) return 0;
    const Ctor = (Intl as unknown as { Segmenter?: new (locale?: string, options?: { granularity: "word" }) => Segmenter }).Segmenter;
    if (Ctor) {
        try {
            let n = 0;
            for (const part of new Ctor(language || undefined, { granularity: "word" }).segment(flat)) if (part.isWordLike) n++;
            return n;
        } catch {
            // An unknown locale: the spaces below.
        }
    }
    return flat.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

/** The selection as a query: trimmed of spaces and of the punctuation around it, spaces folded. */
export function lookupQuery(selection: string): string {
    return selection
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, "");
}

/** Whether *Look up* is offered for this selection: one to three words (FR-1). */
export function lookupOffered(selection: string, language?: string): boolean {
    const query = lookupQuery(selection);
    if (!query || query.length > LOOKUP_MAX_CHARS) return false;
    const n = wordCount(query, language);
    return n >= 1 && n <= LOOKUP_MAX_WORDS;
}

/**
 * The hits for `selection` in `dictionaries`, in FR-5's order — one per dictionary that has the word,
 * by its headword, else by a synonym.
 */
export function findWord<T extends LookupDictionary>(dictionaries: readonly T[], selection: string, uiLanguage: string): LookupHit<T>[] {
    const query = lookupQuery(selection);
    if (!query) return [];
    const hits: LookupHit<T>[] = [];
    for (const dictionary of orderDictionaries(dictionaries, uiLanguage)) {
        const key = foldWord(query, dictionary.languages?.from);
        const translation = dictionary.languages ? isBilingual(dictionary.languages) : false;
        const head = dictionary.headwords.get(key);
        if (head && head.length > 0) {
            hits.push({ dictionary, records: [...head], via: "headword", translation });
            continue;
        }
        const syn = dictionary.synonyms?.get(key);
        if (syn && syn.length > 0) hits.push({ dictionary, records: [...syn], via: "synonym", translation });
    }
    return hits;
}
