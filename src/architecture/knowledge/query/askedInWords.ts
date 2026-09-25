/**
 * A question asked in words, turned into a query the engine already understands (#576, epic #574).
 *
 * *Think before you look* came with its own matching: a walk over the model asking whether an
 * idea's title contained any word of the question. That is `about:<term>` — the predicate this
 * product has shipped since #318 — reimplemented smaller and slightly wrong, and of the two only
 * one would ever get a fix.
 *
 * So the mechanic moves to where the asking happens, and this is the whole of what moving it
 * needed: words in, a query out. The matching belongs to `graphQuery` and stays there.
 *
 * You never have to learn a predicate to use it. That is the point of the bridge existing at all —
 * §XIII says the syntax is an export format and an escape hatch, never the front door.
 */

/** Shorter than this and a word matches half the vault while meaning none of it. */
export const ASKED_MIN_WORD = 4;

/** Past this many the query stops narrowing anything, and a sentence is not a search. */
export const ASKED_MAX_TERMS = 8;

/** Anything that is not a letter or a number, in any script — so accents and CJK survive. */
const SEPARATOR = /[^\p{L}\p{N}]+/u;

/** The words worth asking about, lower-cased, each one once, in the order you wrote them. */
export function questionTerms(question: string): string[] {
    const words = question
        .toLowerCase()
        .split(SEPARATOR)
        .filter((word) => word.length >= ASKED_MIN_WORD);
    return [...new Set(words)].slice(0, ASKED_MAX_TERMS);
}

/**
 * The query: **any** of the words, which is what the panel's own walk did. An empty string when
 * there is nothing to ask — and `runGraphQuery("")` already matches nothing, so the caller needs
 * no special case.
 */
export function questionQuery(question: string): string {
    return questionTerms(question)
        .map((term) => `about:${term}`)
        .join(" OR ");
}
