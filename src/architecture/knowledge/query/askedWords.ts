/**
 * **Ask in your own words** (#696, epic #692): a sentence becomes the terms the engine already
 * understands — deterministically, and in full view.
 *
 * Explore's ask bar takes "permanent notes without a source" as readily as
 * `state:permanent AND unsourced`. What it understood comes back as chips you can see, flip and
 * remove, and the answer card says how each one narrowed the vault, so nothing is guessed behind
 * your back. No model, no AI, no network: a phrase table, your vault's own states, folders and region
 * names, and — for whatever is left — `about:` on the words that remain.
 *
 * §XIII: the syntax stays an escape hatch. Typed, it is used as it is.
 */

/** What the vault calls things — the words a question can be matched against. */
export interface AskVocabulary {
    states: readonly string[];
    folders: readonly string[];
    /** Regions by hub path and the name they are shown with (the hub's, or the one you gave it). */
    regions: readonly { hub: string; name: string }[];
}

export interface AskedTerms {
    terms: string[];
    /** The text was query syntax and is used exactly as typed. */
    syntax: boolean;
}

/** Bare words the engine reads as terms by themselves. */
const BARE_TERMS = new Set(["hub", "orphan", "leaf", "unsourced", "bridge", "alone", "contradiction"]);

/** Phrases, in English and Spanish, and the term each stands for. Earlier rows win a contested span. */
const PHRASES: readonly { pattern: RegExp; term: string }[] = [
    { pattern: /\b(without (a |any )?sources?|unsourced|no sources?|sin fuentes?)\b/, term: "unsourced" },
    { pattern: /\b(with (a )?sources?|sourced|con fuentes?)\b/, term: "!unsourced" },
    { pattern: /\b(orphans?|nothing links( to( it| them)?)?|no backlinks|hu[eé]rfan[ao]s?|nada (las? )?enlaza)\b/, term: "orphan" },
    { pattern: /\b(dead[- ]?ends?|links? to nothing|leaf|leaves|sin salida|no enlazan? a nada)\b/, term: "leaf" },
    { pattern: /\b(alone|isolated|unlinked|lonely|sol[ao]s|aislad[ao]s?)\b/, term: "alone" },
    { pattern: /\b(hubs?|well[- ]connected|muy conectad[ao]s?)\b/, term: "hub" },
    { pattern: /\b(bridges?|joins?|between (my )?regions|connects? (my )?regions|puentes?|unen?)\b/, term: "bridge" },
    { pattern: /\b(contradict\w*|contradic\w*|tensions?|disagree\w*)\b/, term: "contradiction" },
    { pattern: /\b(questions?|preguntas?)\b/, term: "relation:question" },
    { pattern: /\b(this week|esta semana)\b/, term: "newer-than:7" },
    { pattern: /\b(this month|este mes|recent(ly)?|recientes?)\b/, term: "newer-than:30" },
];

/** Words that carry no meaning of their own in a question about notes. */
const STOP = new Set([
    "notes", "note", "notas", "nota", "what", "which", "that", "this", "these", "those", "with", "from",
    "have", "still", "open", "abiertas", "abiertos", "abierta", "show", "find", "every", "some", "they",
    "them", "into", "about", "where", "there", "their", "your", "mine", "todas", "todos", "esas", "estos",
    "cuáles", "cuales", "donde", "dónde", "sobre", "tengo", "están", "estan", "unas", "unos", "aquellas",
    "regions", "region", "regiones", "región", "graph", "grafo", "vault", "bóveda",
]);

/** Looks like query syntax: a predicate with an argument, a negation, AND/OR, or a bare term. */
export function looksLikeSyntax(text: string): boolean {
    const trimmed = text.trim();
    if (trimmed === "") return false;
    if (/\s(and|or)\s/i.test(trimmed)) return true;
    if (/^!|\s!/.test(trimmed)) return true;
    if (/^[a-z-]+:[^\s]/i.test(trimmed) || /\s[a-z-]+:[^\s]/i.test(trimmed)) return true;
    if (/^degree\s*(>=|<=|>|<|=)/i.test(trimmed)) return true;
    return BARE_TERMS.has(trimmed.toLowerCase());
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The terms a question asks for. Syntax comes back as typed (split on `AND`); words are matched
 * against the phrase table and the vault's vocabulary, and what is left becomes `about:` terms.
 */
export function wordsToTerms(question: string, vocabulary: AskVocabulary): AskedTerms {
    const text = question.trim();
    if (text === "") return { terms: [], syntax: false };
    if (looksLikeSyntax(text)) {
        return { terms: text.split(/\s+and\s+/i).map((term) => term.trim()).filter((term) => term !== ""), syntax: true };
    }
    let rest = ` ${text.toLowerCase()} `;
    const terms: string[] = [];
    const add = (term: string) => {
        if (!terms.includes(term)) terms.push(term);
    };
    const take = (pattern: RegExp, term: string) => {
        const match = pattern.exec(rest);
        if (!match) return;
        add(term);
        rest = rest.replace(match[0], " ");
    };

    // The vault's own words first: a region or a folder named in the question is the strongest signal.
    const regions = [...vocabulary.regions].sort((a, b) => b.name.length - a.name.length);
    for (const region of regions) {
        if (!region.name) continue;
        take(new RegExp(`\\b(in |en )?${escape(region.name.toLowerCase())}\\b`), `region:${region.hub}`);
    }
    for (const folder of vocabulary.folders) {
        if (!folder) continue;
        take(new RegExp(`\\b((in|en) ${escape(folder.toLowerCase())}/?|${escape(folder.toLowerCase())}/)`), `folder:${folder}`);
    }
    for (const state of vocabulary.states) {
        if (!state) continue;
        take(new RegExp(`\\b${escape(state.toLowerCase())}\\b`), `state:${state}`);
    }
    for (const { pattern, term } of PHRASES) {
        if (term === "!unsourced" && terms.includes("unsourced")) continue;
        take(pattern, term);
    }

    // Whatever is left, if it means anything: titles that contain those words.
    const words = rest
        .split(/[^\p{L}\p{N}]+/u)
        .filter((word) => word.length >= 4 && !STOP.has(word));
    for (const word of [...new Set(words)].slice(0, 3)) add(`about:${word}`);
    return { terms, syntax: false };
}
