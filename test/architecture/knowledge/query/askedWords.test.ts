import { describe, it, expect } from "@jest/globals";
import { looksLikeSyntax, wordsToTerms, type AskVocabulary } from "architecture/knowledge/query/askedWords";

const vocabulary: AskVocabulary = {
    states: ["permanent", "fleeting"],
    folders: ["Reading", "Projects"],
    regions: [{ hub: "Systems/Consensus.md", name: "Consensus" }],
};

/**
 * **Ask in your own words** (#696): deterministic, and shown back as chips — never guessed behind
 * your back, never AI.
 */
describe("a sentence becomes terms (#696)", () => {
    it("reads the owner's example the way the mockup does", () => {
        expect(wordsToTerms("Permanent notes without a source", vocabulary)).toEqual({ terms: ["state:permanent", "unsourced"], syntax: false });
    });

    it("reads the questions the graph's lenses used to be", () => {
        expect(wordsToTerms("What joins my regions?", vocabulary).terms).toEqual(["bridge"]);
        expect(wordsToTerms("what contradicts what", vocabulary).terms).toEqual(["contradiction"]);
        expect(wordsToTerms("notes nothing links to", vocabulary).terms).toEqual(["orphan"]);
        expect(wordsToTerms("notes on their own, alone", vocabulary).terms).toEqual(["alone"]);
    });

    it("finds the vault's own words: a region, a folder, a state", () => {
        expect(wordsToTerms("fleeting notes in Reading", vocabulary).terms).toEqual(["folder:Reading", "state:fleeting"]);
        expect(wordsToTerms("orphans in Consensus", vocabulary).terms).toEqual(["region:Systems/Consensus.md", "orphan"]);
    });

    it("reads Spanish too", () => {
        expect(wordsToTerms("notas permanentes sin fuente", { ...vocabulary, states: ["permanentes"] }).terms).toEqual(["state:permanentes", "unsourced"]);
        expect(wordsToTerms("¿qué une mis regiones?", vocabulary).terms).toEqual(["bridge"]);
    });

    it("turns what is left into a title search, and ignores words that mean nothing", () => {
        expect(wordsToTerms("show me notes about entropy", vocabulary).terms).toEqual(["about:entropy"]);
    });

    it("uses query syntax exactly as typed", () => {
        expect(wordsToTerms("state:permanent AND orphan", vocabulary)).toEqual({ terms: ["state:permanent", "orphan"], syntax: true });
        expect(wordsToTerms("hub", vocabulary)).toEqual({ terms: ["hub"], syntax: true });
    });

    it("asks nothing of an empty question", () => {
        expect(wordsToTerms("   ", vocabulary)).toEqual({ terms: [], syntax: false });
    });
});

describe("telling syntax from a sentence (#696)", () => {
    it("knows a predicate, a negation, AND/OR and a bare term", () => {
        for (const text of ["state:permanent", "!orphan", "hub or leaf", "degree>=5", "bridge"]) expect(looksLikeSyntax(text)).toBe(true);
    });

    it("leaves a plain sentence alone, even one with a colon after a space", () => {
        for (const text of ["notes without a source", "why: because", ""]) expect(looksLikeSyntax(text)).toBe(false);
    });
});
