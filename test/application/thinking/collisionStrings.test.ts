import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

const PREFIX = "collision_";

const stringsOf = (locale: Record<string, string>) =>
    Object.entries(locale).filter(([key]) => key.startsWith(PREFIX));

/** An answer the system offers is an answer you did not have to find. */
const ANSWERING = [
    /\bfor example\b/i,
    /\bpor ejemplo\b/i,
    /\bthey both\b/i,
    /\blas dos\b/i,
    /\bhint\b/i,
    /\bpista\b/i,
    /\bsuggest/i,
    /\bsugier/i,
];

/** Anything that would turn a free, playful gesture into an obligation. */
const COUNTING = [
    /\d/,
    /\bstreak\b/i,
    /\bracha\b/i,
    /\bdaily\b/i,
    /\bdiari[ao]\b/i,
    /\bpending\b/i,
    /\bpendiente/i,
    /\bwell done\b/i,
    /\bbien hecho\b/i,
];

/**
 * The collision says nothing that answers it, and counts nothing (#567, epic #559).
 *
 * This is the one that is fun: nothing is at stake, nothing is due, there is no right answer and
 * nobody is keeping score. A count of collisions offered, a daily one, a streak — each would arrive
 * as encouragement and each would turn it into homework.
 */
describe("the collision poses and never proposes (#567)", () => {
    it("has all nine strings, in both languages", () => {
        const enKeys = stringsOf(en as Record<string, string>).map(([key]) => key).sort();
        const esKeys = stringsOf(es as Record<string, string>).map(([key]) => key).sort();
        expect(enKeys).toHaveLength(9);
        expect(esKeys).toEqual(enKeys);
    });

    it("never offers an answer, in either language", () => {
        for (const [name, locale] of [
            ["en", en],
            ["es", es],
        ] as const) {
            const offenders = stringsOf(locale as Record<string, string>)
                .filter(([, value]) => ANSWERING.some((pattern) => pattern.test(value)))
                .map(([key, value]) => `${key}: ${value}`);
            expect({ locale: name, offenders }).toEqual({ locale: name, offenders: [] });
        }
    });

    it("counts nothing, and no string carries a digit", () => {
        for (const [name, locale] of [
            ["en", en],
            ["es", es],
        ] as const) {
            const offenders = stringsOf(locale as Record<string, string>)
                .filter(([, value]) => COUNTING.some((pattern) => pattern.test(value)))
                .map(([key, value]) => `${key}: ${value}`);
            expect({ locale: name, offenders }).toEqual({ locale: name, offenders: [] });
        }
    });

    it("is sentence case, not title case", () => {
        for (const [key, value] of stringsOf(en as Record<string, string>)) {
            const words = value.split(" ");
            // A capital is only shouting when it does not open a sentence: the second sentence of
            // an intro line starts with one, and so does anything after a colon.
            const shouted = words.filter(
                (word, index) =>
                    index > 0 && /^[A-Z][a-z]+$/.test(word) && !/[.?!:]$/.test(words[index - 1])
            );
            expect({ key, shouted }).toEqual({ key, shouted: [] });
        }
    });

    it("reports a planted count rather than trusting anyone to notice one", () => {
        const planted = { collision_shown_count: "3 pairs today — keep your streak" };
        const offenders = Object.entries(planted)
            .filter(([, value]) => COUNTING.some((pattern) => pattern.test(value)))
            .map(([key]) => key);
        expect(offenders).toEqual(["collision_shown_count"]);
    });
});
