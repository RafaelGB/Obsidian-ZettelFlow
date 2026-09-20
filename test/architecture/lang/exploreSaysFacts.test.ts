import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

const ROOT = join(__dirname, "..", "..", "..");
const ANSWER = readFileSync(join(ROOT, "src", "architecture", "knowledge", "query", "answer.ts"), "utf8");

/**
 * **Explore states facts, never what to do about them** (#485, epic #481).
 *
 * The empty answer is the tempting place to cross the line. *"`folder:Reading` took it from 43 to
 * none"* is a fact about your selection. *"Try removing that term"* is a verdict about what you
 * should do next — and [§XII](../../../docs/development/constitution.md) puts verdicts behind an
 * explicit human decision. There is no decision to take here anyway: there is a query to edit,
 * and it is on screen.
 *
 * A paragraph in a doc comment will not stop the next person adding a helpful sentence. This will.
 */

/** Second-person imperatives and advice verbs, in both shipped locales. */
const ADVICE = [
    /\btry\b/i,
    /\byou should\b/i,
    /\bconsider\b/i,
    /\bwhy not\b/i,
    /\bintenta\b/i,
    /\bprueba\b/i,
    /\bdeberías\b/i,
    /\bte recomendamos\b/i,
];

type Locale = Record<string, string>;

function exploreStrings(locale: Locale): [string, string][] {
    return Object.entries(locale).filter(([key]) => key.startsWith("explore_"));
}

describe("the answer states facts (#485)", () => {
    it("has explore strings to check at all", () => {
        expect(exploreStrings(en as Locale).length).toBeGreaterThan(10);
    });

    it("never tells you what to do about your own selection", () => {
        for (const [name, locale] of [["en", en], ["es", es]] as const) {
            const offenders = exploreStrings(locale as Locale)
                .filter(([, value]) => ADVICE.some((pattern) => pattern.test(value)))
                .map(([key, value]) => `${key}: ${value}`);
            expect({ locale: name, offenders }).toEqual({ locale: name, offenders: [] });
        }
    });

    it("says what happened to the count, in both locales, with both numbers", () => {
        for (const locale of [en, es] as Locale[]) {
            expect(locale.explore_emptied_by).toContain("{0}");
            expect(locale.explore_emptied_by).toContain("{1}");
        }
    });
});

describe("the explanation refuses rather than guesses (#485)", () => {
    it("returns nothing for a query it cannot narrow one term at a time", () => {
        // Asserted as behaviour in answer.test.ts; asserted here as intent, because the temptation
        // when this returns null is to invent a culprit rather than say nothing.
        expect(ANSWER).toContain("return null");
        expect(ANSWER).toContain("asSelection(term) === null");
    });

    it("writes nothing, anywhere — the answer is computed, never recorded", () => {
        expect(ANSWER).not.toMatch(/FileService|FrontmatterService|recordJudgement/);
    });
});
