import { describe, it, expect } from "@jest/globals";
import {
    buildLookup,
    dictionariesFor,
    dictionaryLanguages,
    findWord,
    lookupOffered,
    lookupQuery,
    orderDictionaries,
    parseIdx,
    parseIfo,
    parseSyn,
    wordCount,
    type LookupDictionary,
} from "application/library/stardict";
import { buildStardict, type FixtureEntry, type FixtureOptions } from "../../../support/stardictFixture";

/** **Finding the word, by the book's language** (#766 AC-2, AC-4). */
function open(name: string, entries: FixtureEntry[], options: FixtureOptions & { saved?: { from?: string; to?: string } } = {}): LookupDictionary {
    const built = buildStardict(entries, { bookname: name, ...options });
    const ifo = parseIfo(built.ifo);
    if (!ifo.ok) throw new Error("ifo");
    const idx = parseIdx(built.idx, ifo.value.idxoffsetbits);
    if (!idx.ok) throw new Error("idx");
    const languages = dictionaryLanguages(ifo.value, options.saved);
    const syn = built.syn ? parseSyn(built.syn, idx.value.count, languages?.from) : null;
    return { name, languages, headwords: buildLookup(idx.value, languages?.from), ...(syn?.ok ? { synonyms: syn.value } : {}) };
}

const SPANISH = open("Wiktionary (Spanish)", [{ word: "casa", definition: "Edificio." }, { word: "correr", definition: "Ir deprisa.", synonyms: ["corrió"] }, { word: "de", definition: "Preposición." }], { lang: "es" });
const SPANISH_ENGLISH = open("FreeDict spa-eng", [{ word: "casa", definition: "house" }], { lang: "es-en" });
const SPANISH_FRENCH = open("Dico es-fr", [{ word: "casa", definition: "maison" }], { saved: { from: "es", to: "fr" } });
const GERMAN = open("Duden", [{ word: "Haus", definition: "Gebäude" }], { lang: "de" });

describe("the selection, as a query (#766 FR-1, FR-6)", () => {
    it("is trimmed of spaces and the punctuation around it, its spaces folded", () => {
        expect(lookupQuery("  «Casa»,  ")).toBe("Casa");
        expect(lookupQuery("tener\n  en cuenta.")).toBe("tener en cuenta");
    });

    it("offers Look up for one to three words, never four or a passage", () => {
        expect(lookupOffered("casa")).toBe(true);
        expect(lookupOffered("tener en cuenta")).toBe(true);
        expect(lookupOffered("a b c d")).toBe(false);
        expect(lookupOffered(" ... ")).toBe(false);
        expect(lookupOffered("x".repeat(81))).toBe(false);
        expect(wordCount("東京都に住む", "ja")).toBeGreaterThan(1);
    });
});

describe("finding the word (#766 AC-2)", () => {
    it("matches a headword ignoring case, then a synonym", () => {
        expect(findWord([SPANISH], "Casa", "en").map((h) => [h.dictionary.name, h.records, h.via])).toEqual([["Wiktionary (Spanish)", [0], "headword"]]);
        expect(findWord([SPANISH], "corrió", "en").map((h) => [h.records, h.via])).toEqual([[[1], "synonym"]]);
    });

    it("guesses nothing: no accent folding, no stemming, no fuzzy match", () => {
        expect(findWord([SPANISH], "cása", "en")).toEqual([]);
        expect(findWord([SPANISH], "casas", "en")).toEqual([]);
        expect(findWord([SPANISH], "corre", "en")).toEqual([]);
    });

    it("orders the answers by FR-5, deterministically: monolingual, into Obsidian's language, any other", () => {
        const order = (dicts: LookupDictionary[]) => findWord(dicts, "casa", "en").map((h) => [h.dictionary.name, h.translation]);
        const want = [["Wiktionary (Spanish)", false], ["FreeDict spa-eng", true], ["Dico es-fr", true]];
        expect(order([SPANISH_FRENCH, SPANISH_ENGLISH, SPANISH])).toEqual(want);
        expect(order([SPANISH_ENGLISH, SPANISH, SPANISH_FRENCH])).toEqual(want);
        // In a French Obsidian the French one comes before the English one.
        expect(orderDictionaries([SPANISH_ENGLISH, SPANISH_FRENCH, SPANISH], "fr").map((d) => d.name)).toEqual(["Wiktionary (Spanish)", "Dico es-fr", "FreeDict spa-eng"]);
    });
});

describe("picked by the book's language (#766 AC-4)", () => {
    it("reads the languages from the declaration, else from the two saved fields, else not at all", () => {
        expect(dictionaryLanguages({ lang: { from: "es", to: "en" } }, { from: "de" })).toEqual({ from: "es", to: "en" });
        expect(dictionaryLanguages({}, { from: "es", to: "fr" })).toEqual({ from: "es", to: "fr" });
        expect(dictionaryLanguages({}, { from: "es", to: "es" })).toEqual({ from: "es" });
        expect(dictionaryLanguages({}, { from: "not a tag!" })).toBeNull();
        expect(dictionaryLanguages(null)).toBeNull();
    });

    it("uses the dictionaries whose from is the book's language", () => {
        const all = [GERMAN, SPANISH_ENGLISH, SPANISH, open("Unknown", [{ word: "x", definition: "y" }])];
        expect(dictionariesFor("es-ES", all).map((d) => d.name)).toEqual(["FreeDict spa-eng", "Wiktionary (Spanish)"]);
        expect(dictionariesFor("de", all).map((d) => d.name)).toEqual(["Duden"]);
        expect(dictionariesFor("en", all)).toEqual([]);
        expect(dictionariesFor("", all)).toEqual([]);
    });
});
