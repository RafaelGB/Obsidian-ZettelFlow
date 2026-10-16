import { c, log } from "architecture";

/**
 * **Justify only where words can break** (#809). A justified column without hyphenation opens rivers
 * between its words; Obsidian on the desktop (Electron on Windows) breaks no word in any language,
 * while WebKit on an iPad does. So the Reader asks the runtime itself, once per language per session,
 * and sets a column ragged where it cannot hyphenate — the *Justify* preference is never changed.
 */

/** What the Type panel says about the hyphens (FR-8): which line, or none. */
export type HyphenationHint = { kind: "hyphenated"; language: string } | { kind: "missing"; language: string } | null;

/**
 * Whether the column is justified, and what the panel says (FR-3, FR-4, FR-7, FR-9). `hyphenates` is
 * the probe's answer for the column's language: `null` when it could not tell, which justifies as
 * before and claims nothing either way.
 */
export function justifyDecision(justify: boolean, hyphenates: boolean | null, language: string): { justified: boolean; hint: HyphenationHint } {
    if (!justify) return { justified: false, hint: null };
    if (hyphenates === null) return { justified: true, hint: null };
    return hyphenates ? { justified: true, hint: { kind: "hyphenated", language } } : { justified: false, hint: { kind: "missing", language } };
}

/** A probe: whether `doc`'s runtime breaks a long word of `lang` — `null` when it cannot tell. */
export type HyphenationProbe = (doc: Document | undefined, lang: string) => boolean | null;

/** A word long enough to break in any of the languages a reader reads, and in none it is not one of. */
const PROBE_WORDS: Record<string, string> = {
    es: "interrelacionadamente",
    en: "internationalization",
    de: "Donaudampfschifffahrt",
    fr: "anticonstitutionnellement",
    it: "precipitevolissimevolmente",
    pt: "inconstitucionalissimamente",
};

/**
 * The real probe (FR-1): the same long word in a narrow box, set once with `hyphens: auto` and once
 * with `manual`. A runtime that hyphenates `lang` wraps the first onto more lines. Built with classes
 * only — no inline style — off-screen and invisible, and taken away at once.
 */
export function probeHyphenation(doc: Document | undefined, lang: string): boolean | null {
    const body = doc?.body;
    if (!body) return null;
    const word = PROBE_WORDS[lang.split("-")[0].toLowerCase()] ?? PROBE_WORDS.en;
    const auto = body.createDiv({ cls: c("reader-hyphen-probe"), text: word, attr: { lang, "aria-hidden": "true" } });
    const manual = body.createDiv({ cls: [c("reader-hyphen-probe"), c("reader-hyphen-probe--manual")], text: word, attr: { lang, "aria-hidden": "true" } });
    try {
        const broken = auto.offsetHeight;
        const whole = manual.offsetHeight;
        if (!broken || !whole) return null;
        return broken > whole;
    } finally {
        auto.remove();
        manual.remove();
    }
}

/**
 * **Whether this runtime hyphenates a language**, asked once per language per session (FR-2) and
 * shared by every chapter, book and Reader leaf. An answer it could not get is kept as `null` too,
 * said once at debug, never as a Notice (FR-7).
 */
export class HyphenationSupport {
    private static instance: HyphenationSupport | null = null;
    private readonly known = new Map<string, boolean | null>();
    private probe: HyphenationProbe = probeHyphenation;

    static getInstance(): HyphenationSupport {
        if (!HyphenationSupport.instance) HyphenationSupport.instance = new HyphenationSupport();
        return HyphenationSupport.instance;
    }

    /** Tests and a new session: forget every answer, and use `probe` from now on. */
    static reset(probe?: HyphenationProbe): void {
        HyphenationSupport.instance = new HyphenationSupport();
        if (probe) HyphenationSupport.instance.probe = probe;
    }

    hyphenates(lang: string, doc: Document | undefined): boolean | null {
        const key = lang.toLowerCase();
        if (this.known.has(key)) return this.known.get(key) ?? null;
        let answer: boolean | null;
        let why = "no answer";
        try {
            answer = this.probe(doc, key);
        } catch (error) {
            answer = null;
            why = error instanceof Error ? error.name : "error";
        }
        // Once per language: the answer is kept, so this is never said twice.
        if (answer === null) log.debug(`[Reader] cannot tell whether ${key} hyphenates here (${why}): justified as before`);
        this.known.set(key, answer);
        return answer;
    }
}
