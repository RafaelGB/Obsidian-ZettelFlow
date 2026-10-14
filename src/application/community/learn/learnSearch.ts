import { pick, tutorialsInTracks, type Faq, type L10n, type LearnCatalog, type RefRow, type Tutorial } from "./learnCatalog";

/**
 * **What do you want to do?** (#802 FR-7) — Learn's search, pure.
 *
 * A query matches a tutorial's title, summary and step text, a reference row's name, line and door,
 * and a question with its answer — in the language Obsidian speaks, ignoring case and accents
 * (`biblioteca` finds *Biblioteca*, `canvás` finds *canvas*). It searches the parsed catalog, so a
 * tutorial about a newer plugin is not there to be found (AC-7). The highlight is a list of ranges
 * in the **original** text, which the room draws as text nodes — never as HTML.
 */

const MARKS = /\p{M}/gu;

/** One character, or a whole string, without case or accents. */
export function fold(text: string): string {
    return text.normalize("NFD").replace(MARKS, "").toLowerCase();
}

/**
 * Where `query` occurs in `text`, as `[start, end)` ranges of the original string: found in the
 * folded text, and mapped back character by character, so an accent never shifts a highlight. A mark
 * that folds to nothing after a match stays with its letter.
 */
export function matchRanges(text: string, query: string): [number, number][] {
    const needle = fold(query.trim());
    if (!needle) return [];
    let folded = "";
    /** For each folded code unit: the original character it came from, as `[start, end)`. */
    const origin: [number, number][] = [];
    let at = 0;
    for (const char of text) {
        const piece = fold(char);
        for (let i = 0; i < piece.length; i++) origin.push([at, at + char.length]);
        folded += piece;
        at += char.length;
    }
    const ranges: [number, number][] = [];
    for (let from = folded.indexOf(needle); from >= 0; from = folded.indexOf(needle, from + needle.length)) {
        const start = origin[from][0];
        let end = origin[from + needle.length - 1][1];
        // A combining mark right after the match folds to nothing: it belongs to the last letter.
        while (end < text.length && fold(text[end]) === "") end++;
        ranges.push([start, end]);
    }
    return ranges;
}

export interface LearnResults {
    tutorials: Tutorial[];
    reference: RefRow[];
    faq: Faq[];
}

function matches(query: string, lang: string, ...texts: L10n[]): boolean {
    const needle = fold(query.trim());
    return texts.some((text) => fold(pick(text, lang)).includes(needle));
}

/** The three groups a query answers with, in catalog order. A blank query answers nothing. */
export function searchCatalog(catalog: LearnCatalog, query: string, lang: string): LearnResults {
    if (!fold(query.trim())) return { tutorials: [], reference: [], faq: [] };
    return {
        tutorials: tutorialsInTracks(catalog).filter((one) =>
            matches(query, lang, one.title, one.summary, ...one.steps.flatMap((step) => [step.title, step.body]))
        ),
        reference: catalog.reference.filter((row) => matches(query, lang, row.name, row.line, row.door)),
        faq: catalog.faq.filter((entry) => matches(query, lang, entry.q, entry.a)),
    };
}
