import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

// test/application/thinking → 3 ups → repo root
const ROOT = join(__dirname, "..", "..", "..");

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
    it("has every string in both languages", () => {
        const enKeys = stringsOf(en as Record<string, string>).map(([key]) => key).sort();
        const esKeys = stringsOf(es as Record<string, string>).map(([key]) => key).sort();
        expect(enKeys).toHaveLength(11);
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

/**
 * Nowhere in the product is a number about collisions (#569 FR-5).
 *
 * This is the one that is fun, which is exactly why it is the one most likely to grow a score. A
 * count of pairs offered, a daily one, a tally of what you dismissed — each would arrive as
 * encouragement and each would turn a free gesture into homework. The scan is over **all of
 * `src/`**, because the count would not be added in the collision's own files.
 */
describe("nothing counts collisions, anywhere (#569)", () => {
    const SRC = join(ROOT, "src");

    const sources = (dir: string, out: string[] = []): string[] => {
        for (const entry of readdirSync(dir)) {
            const full = join(dir, entry);
            if (statSync(full).isDirectory()) sources(full, out);
            else if (/\.tsx?$/.test(entry)) out.push(full);
        }
        return out;
    };

    it("computes no tally for display", () => {
        const forbidden = ["collisions.length", "collisionCount", "pairsShown", "dismissedCount", "shownCount"];
        for (const file of sources(SRC)) {
            const source = readFileSync(file, "utf8");
            for (const name of forbidden) {
                expect({ file: file.replace(SRC, ""), name, found: source.includes(name) }).toEqual({
                    file: file.replace(SRC, ""),
                    name,
                    found: false,
                });
            }
        }
    });

    it("says nothing about quotas or dailies, in either language", () => {
        const QUOTA = [/\bquota\b/i, /\bcupo\b/i, /\btoday\b/i, /\bhoy\b/i, /\bevery day\b/i, /\bcada d/i];
        for (const [name, locale] of [
            ["en", en],
            ["es", es],
        ] as const) {
            const offenders = stringsOf(locale as Record<string, string>)
                .filter(([, value]) => QUOTA.some((pattern) => pattern.test(value)))
                .map(([key, value]) => `${key}: ${value}`);
            expect({ locale: name, offenders }).toEqual({ locale: name, offenders: [] });
        }
    });

    it("never interpolates anything into a collision string", () => {
        for (const [key, value] of stringsOf(en as Record<string, string>)) {
            expect({ key, placeholder: value.includes("{0}") }).toEqual({ key, placeholder: false });
        }
    });

    it("carries the feature in the README, where a user decides to install", () => {
        const readme = readFileSync(join(ROOT, "README.md"), "utf8");
        const features = readme.slice(readme.indexOf("## Features"));
        const toolkit = readme.slice(readme.indexOf("## Zettelkasten toolkit"), readme.indexOf("## Features"));
        expect(features.toLowerCase()).toContain("collision");
        expect(toolkit.toLowerCase()).toContain("far apart");
    });

    it("apologises for nothing when the vault is too small", () => {
        const empty = (en as Record<string, string>).collision_nothing_far_enough;
        expect(empty).toBeTruthy();
        for (const pattern of [/\bsorry\b/i, /\blo siento\b/i, /\bwrite more\b/i, /\bescribe más\b/i, /\bshould\b/i, /\bdeberías\b/i]) {
            expect({ empty, pattern: String(pattern), found: pattern.test(empty) }).toEqual({
                empty,
                pattern: String(pattern),
                found: false,
            });
        }
    });
});
