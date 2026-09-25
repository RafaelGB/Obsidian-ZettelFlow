import { describe, it, expect } from "@jest/globals";
import {
    questionTerms,
    questionQuery,
    ASKED_MIN_WORD,
    ASKED_MAX_TERMS,
} from "architecture/knowledge/query/askedInWords";
import { runGraphQuery } from "architecture/knowledge/query/graphQuery";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";
import type { Idea } from "architecture/knowledge/model/Idea";

/**
 * A question asked in words, run through the engine that already exists (#576, epic #574).
 *
 * The blind panel had its own matching: a walk over the model asking whether an idea's title
 * contained any word of the question. That is `about:<term>`, done worse — same intent, second
 * implementation, and of the two only one would ever get a fix. This module is the bridge, and the
 * bridge is all it is: the matching itself belongs to `graphQuery` and stays there.
 */
const named = (path: string, title: string): Idea => ({ ...idea(path, "permanent"), title });

describe("a question becomes terms (#576)", () => {
    it("keeps the words long enough to mean something", () => {
        expect(questionTerms("what does attention have to do with memory")).toEqual([
            "what",
            "does",
            "attention",
            "have",
            "with",
            "memory",
        ]);
    });

    it("drops the short ones, which match half the vault and mean none of it", () => {
        expect(questionTerms("is it a bug or a design")).toEqual(["design"]);
        expect(ASKED_MIN_WORD).toBe(4);
    });

    it("says each word once, however often you say it", () => {
        expect(questionTerms("memory and memory and MEMORY")).toEqual(["memory"]);
    });

    it("splits on anything that is not a letter or a number, in any script", () => {
        expect(questionTerms("¿qué relación tiene «atención» con memoria?")).toContain("atención");
        expect(questionTerms("read/write — split?")).toEqual(["read", "write", "split"]);
    });

    it("stops at a sane number of terms", () => {
        const long = Array.from({ length: 40 }, (_, n) => `word${n}`).join(" ");
        expect(questionTerms(long)).toHaveLength(ASKED_MAX_TERMS);
    });

    it("has nothing to say about a question with no words in it", () => {
        expect(questionTerms("")).toEqual([]);
        expect(questionTerms("a b c ?!")).toEqual([]);
    });
});

describe("the terms become a query the existing engine runs (#576)", () => {
    it("asks for any of them, the way the panel's own walk did", () => {
        expect(questionQuery("what is attention")).toBe("about:what OR about:attention");
    });

    it("is empty when there is nothing to ask — and the engine already matches nothing", () => {
        expect(questionQuery("a b")).toBe("");
        expect(runGraphQuery(buildModel([named("a.md", "anything")]), "").matches).toEqual([]);
    });

    it("finds what the hand-rolled walk found — matching on the title", () => {
        const model = buildModel([
            named("one.md", "Attention is a filter"),
            named("two.md", "Sleep and memory"),
            named("three.md", "Something else"),
        ]);
        const found = runGraphQuery(model, questionQuery("how does attention shape memory")).matches;
        expect(found.map((m) => m.path).sort()).toEqual(["one.md", "two.md"]);
    });

    it("matches on the path too, which the panel's own walk never did", () => {
        // Not a behaviour change smuggled in: it is what `about:` means, and inheriting the
        // engine's definition instead of keeping a private one is the entire point of the move.
        const model = buildModel([named("Attention/untitled.md", "Untitled")]);
        expect(runGraphQuery(model, questionQuery("what about attention")).matches).toHaveLength(1);
    });

    it("returns a parseable query for a question full of punctuation", () => {
        const result = runGraphQuery(buildModel([]), questionQuery("¿«atención»: memoria, o no?"));
        expect(result.error).toBeUndefined();
    });
});
