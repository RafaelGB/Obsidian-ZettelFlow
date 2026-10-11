import type { KnowledgeModel } from "../model/KnowledgeModel";
import { memoise } from "../model/memo";
import { COMMON_WORDS } from "./commonWords";

/**
 * **The names a passage can say** (#754 FR-3a, FR-15) — every note's title and aliases, folded and
 * indexed by their first word, so finding the notes a paragraph names is one pass over its words.
 *
 * A name matches as **whole words**, with case and accents folded: *Planning Bias* names a note
 * aliased *planning bias*, *falacia de planificacion* names *Falacia de planificación*, and
 * *planning fallacys* names nothing. A name made only of common words, or one word shorter than
 * five letters, never matches (see `commonWords.ts`). No AI and no score: a rule you can read.
 *
 * Built **once per model revision** — the passage changes as you read, the vault does not. Pure.
 */

/** A name longer than this many words is not looked for: no paragraph says a sentence-long title. */
export const NAME_MAX_WORDS = 6;
/** One word on its own names a note only from this many letters up. */
export const SINGLE_WORD_LETTERS = 5;

export interface VocabularyEntry {
    words: readonly string[];
    path: string;
}

export interface Vocabulary {
    /** The matchable names, by their first word. */
    readonly byFirst: ReadonlyMap<string, readonly VocabularyEntry[]>;
    /** The longest name, in words: how far a match looks ahead. */
    readonly longest: number;
}

const WORD = /[\p{L}\p{N}]+/gu;
const MARKS = /\p{M}/gu;
const LETTER = /\p{L}/u;

/** A text's words, folded: lower case, accents taken off, punctuation dropped. */
export function foldWords(text: string): string[] {
    return text.normalize("NFD").replace(MARKS, "").toLowerCase().match(WORD) ?? [];
}

/** Whether a name, as folded words, can name a note in a passage (FR-3a). */
export function isMatchableName(words: readonly string[]): boolean {
    if (words.length === 0 || words.length > NAME_MAX_WORDS) return false;
    const meaningful = words.filter((word) => LETTER.test(word) && !COMMON_WORDS.has(word));
    if (meaningful.length === 0) return false;
    if (words.length === 1) return [...words[0]].length >= SINGLE_WORD_LETTERS;
    return true;
}

/** Build the vocabulary of a model: every note's title and aliases that can be matched. */
export function buildVocabulary(model: KnowledgeModel): Vocabulary {
    const byFirst = new Map<string, VocabularyEntry[]>();
    let longest = 0;
    for (const idea of model.all()) {
        const seen = new Set<string>();
        for (const name of [idea.title, ...(idea.aliases ?? [])]) {
            const words = foldWords(name ?? "");
            const key = words.join(" ");
            if (seen.has(key) || !isMatchableName(words)) continue;
            seen.add(key);
            const list = byFirst.get(words[0]) ?? [];
            list.push({ words, path: idea.path });
            byFirst.set(words[0], list);
            longest = Math.max(longest, words.length);
        }
    }
    // Longest first, so *planning fallacy* wins over *planning* where both are names.
    for (const list of byFirst.values()) list.sort((a, b) => b.words.length - a.words.length || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return { byFirst, longest };
}

/** The vocabulary of the model as it is now: built once per revision. */
export const alongsideVocabulary = memoise("alongside.vocabulary", (model: KnowledgeModel): Vocabulary => buildVocabulary(model));

/**
 * The notes a text names, each once, in the order it names them. A match consumes its words, so
 * *planning fallacy* is one name and not also *fallacy*.
 */
export function namedIn(vocabulary: Vocabulary, text: string): string[] {
    const words = foldWords(text);
    const found: string[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < words.length; i++) {
        const candidates = vocabulary.byFirst.get(words[i]);
        if (!candidates) continue;
        for (const entry of candidates) {
            const n = entry.words.length;
            if (i + n > words.length) continue;
            let same = true;
            for (let k = 1; k < n; k++) {
                if (words[i + k] !== entry.words[k]) {
                    same = false;
                    break;
                }
            }
            if (!same) continue;
            if (!seen.has(entry.path)) {
                seen.add(entry.path);
                found.push(entry.path);
            }
            i += n - 1;
            break;
        }
    }
    return found;
}
